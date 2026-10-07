import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/verify-webhook";
import { queryShopifyAdmin } from "@/lib/shopify/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function parseShopifyId(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = String(val);
  const parts = str.split("/");
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 0 : num;
}

export async function POST(request: NextRequest) {
  // 1. Read raw body as text FIRST for HMAC verification
  const rawBody = await request.text();

  // 2. Get HMAC header
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  // 3. Verify HMAC
  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn("Unauthorized webhook request: Invalid HMAC signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Parse JSON
  let product: any;
  try {
    product = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse webhook JSON payload:", err);
    return new NextResponse("Bad Request: Invalid JSON", { status: 400 });
  }

  try {
    const shopifyProductId = parseShopifyId(product.id);
    if (!shopifyProductId) {
      console.warn("Product webhook received without valid ID:", product);
      return NextResponse.json({ success: false, message: "Missing product ID" }, { status: 200 });
    }

    const normalizedStatus = product.status ? product.status.toLowerCase() : "active";
    const imageUrl =
      product.image?.src ||
      product.images?.[0]?.src ||
      product.featuredImage?.url ||
      null;

    // Extract variants array (handles REST array or GraphQL edges/node format)
    const rawVariants = Array.isArray(product.variants)
      ? product.variants
      : Array.isArray(product.variants?.edges)
      ? product.variants.edges.map((e: any) => e.node)
      : [];

    // Calculate price range
    const prices = rawVariants
      .map((v: any) => (v.price !== undefined && v.price !== null ? parseFloat(v.price) : NaN))
      .filter((p: number) => !isNaN(p));

    const priceMin =
      prices.length > 0
        ? Math.min(...prices)
        : product.priceRangeV2?.minVariantPrice?.amount
        ? parseFloat(product.priceRangeV2.minVariantPrice.amount)
        : null;

    const priceMax =
      prices.length > 0
        ? Math.max(...prices)
        : product.priceRangeV2?.maxVariantPrice?.amount
        ? parseFloat(product.priceRangeV2.maxVariantPrice.amount)
        : null;

    // 5. Upsert product into "products" table
    const { data: upsertedProduct, error: productError } = await supabaseAdmin
      .from("products")
      .upsert(
        {
          shopify_product_id: shopifyProductId,
          title: product.title || "Untitled Product",
          vendor: product.vendor || null,
          product_type: product.product_type || product.productType || null,
          status: normalizedStatus,
          image_url: imageUrl,
          price_min: priceMin,
          price_max: priceMax,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "shopify_product_id",
        }
      )
      .select("id")
      .single();

    if (productError) {
      console.error("Error upserting product in webhook:", productError);
      throw productError;
    }

    // 6. Fetch live inventory levels from Shopify for this product's variants
    const productGid = `gid://shopify/Product/${shopifyProductId}`;
    const inventoryMap = new Map<number, number>();

    try {
      const shopifyRes = await queryShopifyAdmin(
        `
        query GetProductInventoryLevels($id: ID!) {
          product(id: $id) {
            variants(first: 100) {
              edges {
                node {
                  id
                  inventoryItem {
                    id
                    inventoryLevels(first: 1) {
                      edges {
                        node {
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        `,
        { id: productGid }
      );

      const variantEdges = shopifyRes?.data?.product?.variants?.edges || [];
      for (const edge of variantEdges) {
        const vId = parseShopifyId(edge.node.id);
        const invLevels = edge.node.inventoryItem?.inventoryLevels?.edges || [];
        let available = 0;
        if (invLevels.length > 0) {
          const quantities = invLevels[0].node?.quantities || [];
          const availObj = quantities.find((q: any) => q.name === "available");
          if (availObj && typeof availObj.quantity === "number") {
            available = availObj.quantity;
          }
        }
        inventoryMap.set(vId, available);
      }
    } catch (invFetchError) {
      console.warn("Could not query live inventoryLevels from Shopify:", invFetchError);
    }

    // 7. Upsert variants into "product_variants" and sync into "inventory"
    for (const variant of rawVariants) {
      const shopifyVariantId = parseShopifyId(variant.id);
      if (!shopifyVariantId) continue;

      const price =
        variant.price !== undefined && variant.price !== null
          ? parseFloat(variant.price)
          : 0;

      const { data: upsertedVariant, error: variantError } = await supabaseAdmin
        .from("product_variants")
        .upsert(
          {
            shopify_variant_id: shopifyVariantId,
            product_id: upsertedProduct.id,
            sku: variant.sku || null,
            title: variant.title || null,
            price: isNaN(price) ? 0 : price,
          },
          {
            onConflict: "shopify_variant_id",
          }
        )
        .select("id")
        .single();

      if (variantError) {
        console.error("Error upserting variant in webhook:", variantError);
        continue;
      }

      // Determine available inventory quantity:
      // Priority 1: Fresh quantity from Shopify GraphQL inventoryLevels
      // Priority 2: inventory_quantity directly on webhook variant payload
      // Priority 3: 0
      let availableQuantity = inventoryMap.get(shopifyVariantId);
      if (availableQuantity === undefined) {
        if (typeof variant.inventory_quantity === "number") {
          availableQuantity = variant.inventory_quantity;
        } else {
          availableQuantity = 0;
        }
      }

      // Upsert into Supabase "inventory" table matching on variant_id
      const { error: invError } = await supabaseAdmin
        .from("inventory")
        .upsert(
          {
            variant_id: upsertedVariant.id,
            quantity: availableQuantity,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "variant_id",
          }
        );

      if (invError) {
        console.error("Error upserting inventory row in webhook:", invError);
      }
    }

    return NextResponse.json({
      success: true,
      productId: upsertedProduct.id,
      shopifyProductId,
    });
  } catch (error: any) {
    console.error("Webhook processing error (products):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process product webhook" },
      { status: 200 }
    );
  }
}
