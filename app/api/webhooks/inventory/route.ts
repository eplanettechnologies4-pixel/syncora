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
    console.warn("Unauthorized webhook request (inventory): Invalid HMAC signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Parse JSON payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse inventory webhook JSON payload:", err);
    return new NextResponse("Bad Request: Invalid JSON", { status: 400 });
  }

  try {
    const rawInventoryItemId = payload.inventory_item_id;
    if (!rawInventoryItemId) {
      console.warn("Inventory webhook received without inventory_item_id:", payload);
      return NextResponse.json(
        { success: false, message: "Missing inventory_item_id" },
        { status: 200 }
      );
    }

    const availableQuantity =
      typeof payload.available === "number"
        ? payload.available
        : parseInt(String(payload.available ?? 0), 10);

    const safeQuantity = isNaN(availableQuantity) ? 0 : availableQuantity;
    const inventoryItemIdNum = parseShopifyId(rawInventoryItemId);
    const inventoryItemGid = `gid://shopify/InventoryItem/${inventoryItemIdNum}`;

    // 5. Look up the variant associated with this inventory_item_id from Shopify GraphQL
    const query = `
      query GetVariantFromInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          variant {
            id
            title
            sku
          }
        }
      }
    `;

    const shopifyRes = await queryShopifyAdmin(query, { id: inventoryItemGid });
    const variantGid = shopifyRes.data?.inventoryItem?.variant?.id;

    if (!variantGid) {
      console.warn(`No variant found in Shopify for inventoryItem ${inventoryItemGid}`);
      return NextResponse.json(
        { success: false, message: "Variant not found for inventory item" },
        { status: 200 }
      );
    }

    const shopifyVariantId = parseShopifyId(variantGid);

    // 6. Look up the variant in Supabase product_variants
    const { data: dbVariant, error: findVariantError } = await supabaseAdmin
      .from("product_variants")
      .select("id")
      .eq("shopify_variant_id", shopifyVariantId)
      .maybeSingle();

    if (findVariantError) {
      console.error("Error querying product_variants:", findVariantError);
      throw findVariantError;
    }

    if (!dbVariant) {
      console.warn(`Variant ${shopifyVariantId} not found in database. Run sync-products first.`);
      return NextResponse.json(
        { success: false, message: "Variant not in database yet" },
        { status: 200 }
      );
    }

    // 7. Upsert into Supabase inventory table matching on variant_id
    const { error: invError } = await supabaseAdmin
      .from("inventory")
      .upsert(
        {
          variant_id: dbVariant.id,
          quantity: safeQuantity,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "variant_id",
        }
      );

    if (invError) {
      console.error("Error upserting inventory row in webhook:", invError);
      throw invError;
    }

    return NextResponse.json({
      success: true,
      variantId: dbVariant.id,
      shopifyVariantId,
      newQuantity: safeQuantity,
    });
  } catch (error: any) {
    console.error("Webhook processing error (inventory):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process inventory webhook" },
      { status: 200 }
    );
  }
}
