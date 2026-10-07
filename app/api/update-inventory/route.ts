import { NextResponse } from "next/server";
import crypto from "crypto";
import { queryShopifyAdmin } from "@/lib/shopify/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface UpdateInventoryBody {
  variantId: string | number;
  newQuantity: number;
}

export async function POST(request: Request) {
  try {
    const body: UpdateInventoryBody = await request.json();
    const { variantId, newQuantity } = body;

    if (variantId === undefined || variantId === null) {
      return NextResponse.json(
        { success: false, error: "variantId is required" },
        { status: 400 }
      );
    }

    const parsedQuantity = parseInt(String(newQuantity), 10);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return NextResponse.json(
        { success: false, error: "newQuantity must be a non-negative integer" },
        { status: 400 }
      );
    }

    // 1. Look up variant in Supabase
    let dbVariant: { id: string; shopify_variant_id: number } | null = null;
    if (typeof variantId === "string" && variantId.includes("-")) {
      const { data, error } = await supabaseAdmin
        .from("product_variants")
        .select("id, shopify_variant_id")
        .eq("id", variantId)
        .maybeSingle();

      if (error) throw error;
      dbVariant = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("product_variants")
        .select("id, shopify_variant_id")
        .eq("shopify_variant_id", Number(variantId))
        .maybeSingle();

      if (error) throw error;
      dbVariant = data;
    }

    if (!dbVariant) {
      return NextResponse.json(
        { success: false, error: `Variant not found for identifier: ${variantId}` },
        { status: 404 }
      );
    }

    // 2. Fetch current variant inventory metadata from Shopify
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

    const variantRes = await queryShopifyAdmin(variantQuery, { id: shopifyVariantGid });

    if (variantRes.errors && variantRes.errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Shopify variant query failed: ${variantRes.errors[0]?.message}`,
        },
        { status: 500 }
      );
    }

    const variantData = variantRes.data?.productVariant;
    if (!variantData || !variantData.inventoryItem) {
      return NextResponse.json(
        { success: false, error: "Shopify variant or inventoryItem not found" },
        { status: 404 }
      );
    }

    const inventoryItemId = variantData.inventoryItem.id;
    const invLevels = variantData.inventoryItem.inventoryLevels?.edges || [];
    if (invLevels.length === 0 || !invLevels[0].node?.location?.id) {
      return NextResponse.json(
        { success: false, error: "No inventory location found on Shopify for this variant" },
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

    const mutRes = await queryShopifyAdmin(mutation, mutationVariables);

    if (mutRes.errors && mutRes.errors.length > 0) {
      const errMsg = mutRes.errors[0]?.message || "Shopify mutation failed";
      return NextResponse.json(
        {
          success: false,
          error: `Shopify inventory update failed: ${errMsg}`,
        },
        { status: 500 }
      );
    }

    const userErrors = mutRes.data?.inventorySetQuantities?.userErrors || [];
    if (userErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Shopify error: ${userErrors.map((e: any) => e.message).join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 5. Update Supabase inventory table
    const { data: existingInv, error: findInvError } = await supabaseAdmin
      .from("inventory")
      .select("id")
      .eq("variant_id", dbVariant.id)
      .maybeSingle();

    if (findInvError) throw findInvError;

    if (existingInv) {
      const { error: updateError } = await supabaseAdmin
        .from("inventory")
        .update({
          quantity: parsedQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInv.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("inventory")
        .insert({
          variant_id: dbVariant.id,
          quantity: parsedQuantity,
        });

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      variantId: dbVariant.id,
      newQuantity: parsedQuantity,
    });
  } catch (error: any) {
    console.error("Update inventory error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update inventory",
      },
      { status: 500 }
    );
  }
}
