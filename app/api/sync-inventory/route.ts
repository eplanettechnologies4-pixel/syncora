import { NextResponse } from "next/server";
import { queryShopifyAdmin } from "@/lib/shopify/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function extractShopifyId(gid: string): number {
  const parts = gid.split("/");
  const numStr = parts[parts.length - 1];
  const parsed = parseInt(numStr, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid Shopify GID format: "${gid}"`);
  }
  return parsed;
}

export async function GET() {
  const query = `
    query GetProductsInventory {
      products(first: 50) {
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
    const response = await queryShopifyAdmin(query);

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

    const products = response.data?.products?.edges || [];
    let inventorySynced = 0;

    for (const productEdge of products) {
      const product = productEdge.node;
      const variantEdges = product.variants?.edges || [];

      for (const variantEdge of variantEdges) {
        const variant = variantEdge.node;
        const shopifyVariantId = extractShopifyId(variant.id);

        // Extract available quantity from inventoryLevels
        let availableQuantity = 0;
        const invLevels = variant.inventoryItem?.inventoryLevels?.edges || [];
        if (invLevels.length > 0) {
          const quantities = invLevels[0].node?.quantities || [];
          const availObj = quantities.find((q: any) => q.name === "available");
          if (availObj && typeof availObj.quantity === "number") {
            availableQuantity = availObj.quantity;
          }
        }

        // Find the corresponding variant in Supabase product_variants
        const { data: dbVariant, error: findVariantError } = await supabaseAdmin
          .from("product_variants")
          .select("id")
          .eq("shopify_variant_id", shopifyVariantId)
          .maybeSingle();

        if (findVariantError) {
          console.error("Error looking up variant:", findVariantError);
          continue;
        }

        if (!dbVariant) {
          console.warn(`Variant ${shopifyVariantId} not found in database. Run sync-products first.`);
          continue;
        }

        // Upsert into Supabase inventory table matching on variant_id
        const { error: invError } = await supabaseAdmin
          .from("inventory")
          .upsert(
            {
              variant_id: dbVariant.id,
              quantity: availableQuantity,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "variant_id",
            }
          );

        if (invError) {
          throw invError;
        }

        inventorySynced++;
      }
    }

    return NextResponse.json({
      success: true,
      inventorySynced,
    });
  } catch (error: any) {
    console.error("Inventory sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error during inventory sync",
      },
      { status: 500 }
    );
  }
}
