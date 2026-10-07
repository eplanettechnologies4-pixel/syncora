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

interface ShopifyInventoryResponse {
  data?: {
    products?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      edges: Array<{
        node: {
          id: string;
          title: string;
          variants: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                sku: string | null;
                inventoryItem: {
                  id: string;
                  inventoryLevels: {
                    edges: Array<{
                      node: {
                        location: {
                          id: string;
                        };
                        quantities: Array<{
                          name: string;
                          quantity: number;
                        }>;
                      };
                    }>;
                  };
                };
              };
            }>;
          };
        };
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
    return NextResponse.json(
      { ok: false, error: err?.message || "Unauthorized" },
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
    query GetProductsInventory($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 1) {
                      edges {
                        node {
                          location {
                            id
                          }
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
      }
    }
  `;

  try {
    let currentCursor: string | null = startCursor;
    let hasMore = false;
    let inventorySynced = 0;

    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response: ShopifyInventoryResponse = await queryShopifyAdminForShop(
        shopId,
        query,
        { cursor: currentCursor }
      );

      if (response.errors && response.errors.length > 0) {
        console.error("Shopify GraphQL errors during inventory sync:", response.errors);
        return NextResponse.json(
          { ok: false, error: "Shopify API returned an error during inventory sync" },
          { status: 500 }
        );
      }

      const productsData = response.data?.products;
      const products = productsData?.edges || [];

      for (const productEdge of products) {
        const product = productEdge.node;
        const variantEdges = product.variants?.edges || [];

        for (const variantEdge of variantEdges) {
          const variant = variantEdge.node;
          const shopifyVariantId = extractShopifyId(variant.id);

          let availableQuantity = 0;
          const invLevels = variant.inventoryItem?.inventoryLevels?.edges || [];
          if (invLevels.length > 0) {
            const quantities = invLevels[0].node?.quantities || [];
            const availObj = quantities.find((q: any) => q.name === "available");
            if (availObj && typeof availObj.quantity === "number") {
              availableQuantity = availObj.quantity;
            }
          }

          // Lookup variant in database filtered by shop_id
          const { data: dbVariant, error: findVariantError } = await supabaseAdmin
            .from("product_variants")
            .select("id")
            .eq("shop_id", shopId)
            .eq("shopify_variant_id", shopifyVariantId)
            .maybeSingle();

          if (findVariantError) {
            console.error("Error looking up variant:", findVariantError);
            continue;
          }

          if (!dbVariant) {
            continue;
          }

          // Upsert into inventory table with shop_id and composite onConflict
          const { error: invError } = await supabaseAdmin
            .from("inventory")
            .upsert(
              {
                shop_id: shopId,
                variant_id: dbVariant.id,
                quantity: availableQuantity,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "shop_id,variant_id",
              }
            );

          if (invError) {
            throw invError;
          }

          inventorySynced++;
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
        inventorySynced,
      },
      hasMore,
      cursor: hasMore ? currentCursor : null,
    });
  } catch (error: any) {
    console.error("Inventory sync error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Inventory sync failed",
      },
      { status: 500 }
    );
  }
}
