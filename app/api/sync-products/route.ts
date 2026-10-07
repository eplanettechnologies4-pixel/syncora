import { NextResponse } from "next/server";
import { queryShopifyAdmin } from "@/lib/shopify/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Extracts the numeric ID from a Shopify GID (e.g., "gid://shopify/Product/10322207572216" -> 10322207572216)
 */
function extractShopifyId(gid: string): number {
  const parts = gid.split("/");
  const numStr = parts[parts.length - 1];
  const parsed = parseInt(numStr, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid Shopify GID format: "${gid}"`);
  }
  return parsed;
}

interface ShopifyVariantNode {
  id: string;
  sku: string | null;
  title: string | null;
  price: string | null;
}

interface ShopifyProductNode {
  id: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  status: string | null;
  featuredImage?: {
    url: string;
  } | null;
  priceRangeV2?: {
    minVariantPrice?: {
      amount: string;
    };
    maxVariantPrice?: {
      amount: string;
    };
  } | null;
  variants: {
    edges: Array<{
      node: ShopifyVariantNode;
    }>;
  };
}

interface ShopifyProductsResponse {
  data: {
    products: {
      edges: Array<{
        node: ShopifyProductNode;
      }>;
    };
  };
  errors?: any[];
}

export async function GET() {
  const query = `
    query GetProductsForSync {
      products(first: 50) {
        edges {
          node {
            id
            title
            vendor
            productType
            status
            featuredImage {
              url
            }
            priceRangeV2 {
              minVariantPrice {
                amount
              }
              maxVariantPrice {
                amount
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  title
                  price
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response: ShopifyProductsResponse = await queryShopifyAdmin(query);

    if (response.errors && response.errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Shopify GraphQL returned errors",
          details: response.errors,
        },
        { status: 500 }
      );
    }

    const productEdges = response.data?.products?.edges || [];

    let productsCreated = 0;
    let productsUpdated = 0;
    let variantsSynced = 0;

    for (const edge of productEdges) {
      const product = edge.node;
      const shopifyProductId = extractShopifyId(product.id);
      const normalizedStatus = product.status ? product.status.toLowerCase() : "active";

      // Extract image and price values
      const imageUrl = product.featuredImage?.url || null;
      const rawPriceMin = product.priceRangeV2?.minVariantPrice?.amount;
      const rawPriceMax = product.priceRangeV2?.maxVariantPrice?.amount;

      const priceMin =
        rawPriceMin !== undefined && rawPriceMin !== null ? parseFloat(rawPriceMin) : null;
      const priceMax =
        rawPriceMax !== undefined && rawPriceMax !== null ? parseFloat(rawPriceMax) : null;

      // Check if product already exists to accurately count created vs updated
      const { data: existingProduct, error: findError } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("shopify_product_id", shopifyProductId)
        .maybeSingle();

      if (findError) {
        throw findError;
      }

      const isNew = !existingProduct;

      // Upsert product matching on shopify_product_id
      const { data: upsertedProduct, error: productError } = await supabaseAdmin
        .from("products")
        .upsert(
          {
            shopify_product_id: shopifyProductId,
            title: product.title,
            vendor: product.vendor,
            product_type: product.productType,
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
        throw productError;
      }

      if (isNew) {
        productsCreated++;
      } else {
        productsUpdated++;
      }

      const supabaseProductId = upsertedProduct.id;

      // Upsert product variants matching on shopify_variant_id
      const variantEdges = product.variants?.edges || [];
      for (const variantEdge of variantEdges) {
        const variant = variantEdge.node;
        const shopifyVariantId = extractShopifyId(variant.id);
        const price = variant.price ? parseFloat(variant.price) : 0;

        const { error: variantError } = await supabaseAdmin
          .from("product_variants")
          .upsert(
            {
              shopify_variant_id: shopifyVariantId,
              product_id: supabaseProductId,
              sku: variant.sku || null,
              title: variant.title || null,
              price: isNaN(price) ? 0 : price,
            },
            {
              onConflict: "shopify_variant_id",
            }
          );

        if (variantError) {
          throw variantError;
        }

        variantsSynced++;
      }
    }

    return NextResponse.json({
      success: true,
      productsCreated,
      productsUpdated,
      variantsSynced,
    });
  } catch (error: any) {
    console.error("Product sync error:", error);

    const isMissingTable =
      typeof error.message === "string" &&
      (error.message.includes("relation") || error.message.includes("does not exist"));

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error during product sync",
        hint: isMissingTable
          ? "The Supabase database tables may not be created yet. Please execute the SQL in supabase/schema.sql in your Supabase SQL Editor."
          : undefined,
      },
      { status: 500 }
    );
  }
}
