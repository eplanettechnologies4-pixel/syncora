import { NextRequest, NextResponse } from "next/server";
import { requireShopAccess } from "@/lib/auth/shop-context";
import { queryShopifyAdminForShop } from "@/lib/shopify/shop-client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  data?: {
    products?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      edges: Array<{
        node: ShopifyProductNode;
      }>;
    };
  };
  errors?: any[];
}

export async function POST(request: NextRequest) {
  // 1. Verify user shop access
  let shopAccess;
  try {
    shopAccess = await requireShopAccess();
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 401;
    console.error("sync-products: unauthorized", err?.message || "No shop access");
    return NextResponse.json(
      { ok: false, error: "sync-products: unauthorized" },
      { status }
    );
  }

  const { shopId } = shopAccess;

  // 2. Read optional cursor from body
  let startCursor: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.cursor === "string" && body.cursor.trim()) {
      startCursor = body.cursor.trim();
    }
  } catch {
    // Body is optional
  }

  const query = `
    query GetProductsForSync($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
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
    let currentCursor: string | null = startCursor;
    let hasMore = false;
    let productsCreated = 0;
    let productsUpdated = 0;
    let variantsSynced = 0;

    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      let response: ShopifyProductsResponse;
      try {
        response = await queryShopifyAdminForShop(
          shopId,
          query,
          { cursor: currentCursor }
        );
      } catch (err: any) {
        if (err?.code === "reauth_required" || err?.message === "reauth_required") {
          return NextResponse.json(
            { ok: false, error: "Store connection expired. Please reinstall the app from Shopify." },
            { status: 401 }
          );
        }
        if (err?.message?.includes("No Shopify access token found")) {
          console.error("sync-products: no token", err.message);
          return NextResponse.json(
            { ok: false, error: "sync-products: no token" },
            { status: 401 }
          );
        }
        const statusMatch = err?.message?.match(/\[(\d{3})\b/);
        const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 502;
        console.error("sync-products: shopify request failed", httpStatus, err?.message || "Request failed");
        return NextResponse.json(
          { ok: false, error: "sync-products: shopify request failed" },
          { status: httpStatus }
        );
      }

      if (response.errors && response.errors.length > 0) {
        console.error("sync-products: shopify request failed", 502, response.errors[0]?.message || "GraphQL errors");
        return NextResponse.json(
          { ok: false, error: "sync-products: shopify request failed" },
          { status: 502 }
        );
      }

      const productsData = response.data?.products;
      const productEdges = productsData?.edges || [];

      for (const edge of productEdges) {
        const product = edge.node;
        const shopifyProductId = extractShopifyId(product.id);
        const normalizedStatus = product.status ? product.status.toLowerCase() : "active";

        const imageUrl = product.featuredImage?.url || null;
        const rawPriceMin = product.priceRangeV2?.minVariantPrice?.amount;
        const rawPriceMax = product.priceRangeV2?.maxVariantPrice?.amount;

        const priceMin =
          rawPriceMin !== undefined && rawPriceMin !== null ? parseFloat(rawPriceMin) : null;
        const priceMax =
          rawPriceMax !== undefined && rawPriceMax !== null ? parseFloat(rawPriceMax) : null;

        // Lookup existing product filtered by shop_id
        const { data: existingProduct, error: findError } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("shop_id", shopId)
          .eq("shopify_product_id", shopifyProductId)
          .maybeSingle();

        if (findError) {
          console.error("sync-products: product lookup failed", findError.code, findError.message);
          return NextResponse.json(
            { ok: false, error: "sync-products: product lookup failed" },
            { status: 500 }
          );
        }

        const isNew = !existingProduct;

        // Upsert product with shop_id and composite onConflict
        const { data: upsertedProduct, error: productError } = await supabaseAdmin
          .from("products")
          .upsert(
            {
              shop_id: shopId,
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
              onConflict: "shop_id,shopify_product_id",
            }
          )
          .select("id")
          .single();

        if (productError || !upsertedProduct) {
          console.error("sync-products: products upsert failed", productError?.code, productError?.message);
          return NextResponse.json(
            { ok: false, error: "sync-products: products upsert failed" },
            { status: 500 }
          );
        }

        if (isNew) {
          productsCreated++;
        } else {
          productsUpdated++;
        }

        const supabaseProductId = upsertedProduct.id;

        // Upsert product variants with shop_id and composite onConflict
        const variantEdges = product.variants?.edges || [];
        for (const variantEdge of variantEdges) {
          const variant = variantEdge.node;
          const shopifyVariantId = extractShopifyId(variant.id);
          const price = variant.price ? parseFloat(variant.price) : 0;

          const { error: variantError } = await supabaseAdmin
            .from("product_variants")
            .upsert(
              {
                shop_id: shopId,
                shopify_variant_id: shopifyVariantId,
                product_id: supabaseProductId,
                sku: variant.sku || null,
                title: variant.title || null,
                price: isNaN(price) ? 0 : price,
              },
              {
                onConflict: "shop_id,shopify_variant_id",
              }
            );

          if (variantError) {
            console.error("sync-products: variants upsert failed", variantError.code, variantError.message);
            return NextResponse.json(
              { ok: false, error: "sync-products: variants upsert failed" },
              { status: 500 }
            );
          }

          variantsSynced++;
        }
      }

      const pageInfo = productsData?.pageInfo;
      if (pageInfo?.hasNextPage && pageInfo?.endCursor) {
        currentCursor = pageInfo.endCursor;
        hasMore = true;
      } else {
        currentCursor = null;
        hasMore = false;
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      counts: {
        productsCreated,
        productsUpdated,
        variantsSynced,
      },
      hasMore,
      cursor: hasMore ? currentCursor : null,
    });
  } catch (error: any) {
    if (error?.code === "reauth_required" || error?.message === "reauth_required") {
      return NextResponse.json(
        { ok: false, error: "Store connection expired. Please reinstall the app from Shopify." },
        { status: 401 }
      );
    }
    if (error?.message?.includes("No Shopify access token found")) {
      console.error("sync-products: no token", error.message);
      return NextResponse.json(
        { ok: false, error: "sync-products: no token" },
        { status: 401 }
      );
    }
    const statusMatch = error?.message?.match(/\[(\d{3})\b/);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    console.error("sync-products: shopify request failed", httpStatus, error?.message || "Unknown error");
    return NextResponse.json(
      { ok: false, error: "sync-products: shopify request failed" },
      { status: httpStatus }
    );
  }
}
