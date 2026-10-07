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
    console.warn("Unauthorized webhook request (customers-delete): Invalid HMAC signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Parse JSON payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse customers-delete webhook JSON payload:", err);
    return new NextResponse("Bad Request: Invalid JSON", { status: 400 });
  }

  try {
    const shopifyCustomerId = parseShopifyId(payload.id);
    if (!shopifyCustomerId) {
      console.warn("Customers delete webhook received without customer id:", payload);
      return NextResponse.json(
        { success: false, message: "Missing customer ID in payload" },
        { status: 200 }
      );
    }

    // 5. Look up matching customer in Supabase
    const { data: existingCustomer, error: findError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("shopify_customer_id", shopifyCustomerId)
      .maybeSingle();

    if (findError) {
      console.error("Error looking up customer to delete:", findError);
      throw findError;
    }

    if (!existingCustomer) {
      console.log(`Customer with shopify_customer_id ${shopifyCustomerId} not found in database; already deleted or never synced.`);
      return NextResponse.json(
        { success: true, message: "Customer not found in database", shopifyCustomerId },
        { status: 200 }
      );
    }

    // 6. Before deleting: set customer_id to null on any orders referencing this customer
    const { error: updateOrdersError } = await supabaseAdmin
      .from("orders")
      .update({ customer_id: null })
      .eq("customer_id", existingCustomer.id);

    if (updateOrdersError) {
      console.error("Error unlinking customer from orders:", updateOrdersError);
      throw updateOrdersError;
    }

    // 7. Delete the customer from the "customers" table
    const { error: deleteCustomerError } = await supabaseAdmin
      .from("customers")
      .delete()
      .eq("id", existingCustomer.id);

    if (deleteCustomerError) {
      console.error("Error deleting customer:", deleteCustomerError);
      throw deleteCustomerError;
    }

    return NextResponse.json({
      success: true,
      message: "Customer unlinked from orders and deleted successfully",
      shopifyCustomerId,
    });
  } catch (error: any) {
    console.error("Webhook processing error (customers-delete):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process customers-delete webhook" },
      { status: 200 }
    );
  }
}
