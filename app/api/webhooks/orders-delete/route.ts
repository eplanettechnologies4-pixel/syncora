import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/verify-webhook";
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

  // 3. Verify HMAC authenticity
  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn("Unauthorized webhook request (orders-delete): Invalid HMAC signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Parse JSON payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse orders-delete webhook JSON payload:", err);
    return new NextResponse("Bad Request: Invalid JSON", { status: 400 });
  }

  try {
    const shopifyOrderId = parseShopifyId(payload.id);
    if (!shopifyOrderId) {
      console.warn("Orders delete webhook received without order id:", payload);
      return NextResponse.json(
        { success: false, message: "Missing order ID in payload" },
        { status: 200 }
      );
    }

    // 5. Look up matching order in Supabase
    const { data: existingOrder, error: findError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("shopify_order_id", shopifyOrderId)
      .maybeSingle();

    if (findError) {
      console.error("Error looking up order to delete:", findError);
      throw findError;
    }

    if (!existingOrder) {
      console.log(`Order with shopify_order_id ${shopifyOrderId} not found in database; already deleted or never synced.`);
      return NextResponse.json(
        { success: true, message: "Order not found in database", shopifyOrderId },
        { status: 200 }
      );
    }

    // 6. Delete matching rows from order_line_items first (foreign key)
    const { error: lineItemsError } = await supabaseAdmin
      .from("order_line_items")
      .delete()
      .eq("order_id", existingOrder.id);

    if (lineItemsError) {
      console.error("Error deleting order line items:", lineItemsError);
      throw lineItemsError;
    }

    // 7. Delete the order from the "orders" table
    const { error: orderError } = await supabaseAdmin
      .from("orders")
      .delete()
      .eq("id", existingOrder.id);

    if (orderError) {
      console.error("Error deleting order:", orderError);
      throw orderError;
    }

    return NextResponse.json({
      success: true,
      message: "Order and line items deleted successfully",
      shopifyOrderId,
    });
  } catch (error: any) {
    console.error("Webhook processing error (orders-delete):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process orders-delete webhook" },
      { status: 200 }
    );
  }
}
