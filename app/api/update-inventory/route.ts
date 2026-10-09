import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { queryShopifyAdminForShop } from "@/lib/shopify/shop-client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireShopAccess } from "@/lib/auth/shop-context";

export const dynamic = "force-dynamic";

interface UpdateInventoryBody {
  variantId: string | number;
  newQuantity: number;
}

export async function POST(request: NextRequest) {
  let shopAccess;
  try {
    shopAccess = await requireShopAccess();
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Unauthorized" },
      { status: err.status || 401 }
    );
  }
  const { shopId } = shopAccess;

  try {
    const body: UpdateInventoryBody = await request.json();
    const { variantId, newQuantity } = body;

    if (variantId === undefined || variantId === null) {
      return NextResponse.json(
        { ok: false, error: "variantId is required" },
        { status: 400 }
      );
    }

    const parsedQuantity = Number(newQuantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return NextResponse.json(
        { ok: false, error: "Quantity must be a whole number of zero or more" },
        { status: 400 }
      );
    }

    // 1. Look up variant in Supabase scoped by shop_id
    let dbVariant: { id: string; shopify_variant_id: number } | null = null;
    if (typeof variantId === "string" && variantId.includes("-")) {
      const { data, error } = await supabaseAdmin
        .from("product_variants")
        .select("id, shopify_variant_id")
        .eq("id", variantId)
        .eq("shop_id", shopId)
        .maybeSingle();

      if (error) {
        console.error("Variant lookup failed");
        throw error;
      }
      dbVariant = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("product_variants")
        .select("id, shopify_variant_id")
        .eq("shopify_variant_id", Number(variantId))
        .eq("shop_id", shopId)
        .maybeSingle();

      if (error) {
        console.error("Variant lookup failed");
        throw error;
      }
      dbVariant = data;
    }

    if (!dbVariant) {
      return NextResponse.json(
        { ok: false, error: "Variant not found in active store" },
        { status: 404 }
      );
    }

    // 2. Fetch current variant inventory metadata from Shopify using queryShopifyAdminForShop
    const shopifyVariantGid = `gid://shopify/ProductVariant/${dbVariant.shopify_variant_id}`;
    const variantQuery = `
      query GetVariantInventory($id: ID!) {
        productVariant(id: $id) {
          id
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
    `;

    const variantRes = await queryShopifyAdminForShop(shopId, variantQuery, { id: shopifyVariantGid });

    if (variantRes?.errors && variantRes.errors.length > 0) {
      console.error("Shopify variant query error");
      return NextResponse.json(
        { ok: false, error: "Shopify inventory query failed" },
        { status: 500 }
      );
    }

    const variantData = variantRes?.data?.productVariant;
    if (!variantData || !variantData.inventoryItem) {
      return NextResponse.json(
        { ok: false, error: "Shopify variant inventory not found" },
        { status: 404 }
      );
    }

    const inventoryItemId = variantData.inventoryItem.id;
    const invLevels = variantData.inventoryItem.inventoryLevels?.edges || [];
    if (invLevels.length === 0 || !invLevels[0].node?.location?.id) {
      return NextResponse.json(
        { ok: false, error: "No inventory location found on Shopify for this variant" },
        { status: 400 }
      );
    }

    const locationId = invLevels[0].node.location.id;
    const currentQuantities = invLevels[0].node.quantities || [];
    const availableObj = currentQuantities.find((q: any) => q.name === "available");
    const currentQuantity = typeof availableObj?.quantity === "number" ? availableObj.quantity : 0;

    // 3. Generate unique idempotency key using Node's crypto.randomUUID()
    const idempotencyKey = crypto.randomUUID();

    // 4. Push update to Shopify via inventorySetQuantities mutation with @idempotent directive
    const mutation = `
      mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          inventoryAdjustmentGroup {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const mutationVariables = {
      idempotencyKey,
      input: {
        name: "available",
        reason: "correction",
        quantities: [
          {
            inventoryItemId,
            locationId,
            quantity: parsedQuantity,
            changeFromQuantity: currentQuantity,
          },
        ],
      },
    };

    const mutRes = await queryShopifyAdminForShop(shopId, mutation, mutationVariables);

    if (mutRes?.errors && mutRes.errors.length > 0) {
      console.error("Shopify inventory update error");
      return NextResponse.json(
        { ok: false, error: "Shopify inventory update failed" },
        { status: 500 }
      );
    }

    const userErrors = mutRes?.data?.inventorySetQuantities?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("Shopify inventory user error");
      return NextResponse.json(
        { ok: false, error: "Failed to update Shopify inventory level" },
        { status: 400 }
      );
    }

    // 5. Update Supabase inventory table scoped by shop_id
    const { data: existingInv, error: findInvError } = await supabaseAdmin
      .from("inventory")
      .select("id")
      .eq("variant_id", dbVariant.id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (findInvError) {
      console.error("Inventory query failed");
      throw findInvError;
    }

    if (existingInv) {
      const { error: updateError } = await supabaseAdmin
        .from("inventory")
        .update({
          quantity: parsedQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInv.id)
        .eq("shop_id", shopId);

      if (updateError) {
        console.error("Inventory update failed");
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("inventory")
        .insert({
          shop_id: shopId,
          variant_id: dbVariant.id,
          quantity: parsedQuantity,
        });

      if (insertError) {
        console.error("Inventory insert failed");
        throw insertError;
      }
    }

    return NextResponse.json({
      ok: true,
      success: true,
      variantId: dbVariant.id,
      newQuantity: parsedQuantity,
    });
  } catch (error: any) {
    console.error("Update inventory error");
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to update inventory",
      },
      { status: 500 }
    );
  }
}
