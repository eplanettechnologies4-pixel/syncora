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

  // 3. Verify HMAC
  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn("Unauthorized webhook request (orders): Invalid HMAC signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Parse JSON
  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse orders webhook JSON payload:", err);
    return new NextResponse("Bad Request: Invalid JSON", { status: 400 });
  }

  try {
    const shopifyOrderId = parseShopifyId(order.id);
    if (!shopifyOrderId) {
      console.warn("Orders webhook received without valid order ID:", order);
      return NextResponse.json({ success: false, message: "Missing order ID" }, { status: 200 });
    }

    // Calculate order fields first
    const orderNumber = String(order.name || order.order_number || `#${shopifyOrderId}`);
    const totalPrice =
      order.total_price !== undefined && order.total_price !== null
        ? parseFloat(order.total_price)
        : 0;
    const financialStatus = order.financial_status || "pending";
    const fulfillmentStatus = order.fulfillment_status || "unfulfilled";
    const orderCreatedAt = order.created_at || new Date().toISOString();

    // 5. Upsert Customer if available, updating total_orders and total_spent
    let customerDbId: string | null = null;
    const customer = order.customer;
    if (customer) {
      const shopifyCustomerId = parseShopifyId(customer.id);
      if (shopifyCustomerId) {
        // Query existing customer to increment metrics accurately
        const { data: existingCustomer } = await supabaseAdmin
          .from("customers")
          .select("id, total_orders, total_spent, phone")
          .eq("shopify_customer_id", shopifyCustomerId)
          .maybeSingle();

        const currentTotalOrders = existingCustomer?.total_orders || 0;
        const currentTotalSpent = parseFloat(String(existingCustomer?.total_spent || 0));

        const newTotalOrders = currentTotalOrders + 1;
        const newTotalSpent = Number(
          (currentTotalSpent + (isNaN(totalPrice) ? 0 : totalPrice)).toFixed(2)
        );

        const customerPhone =
          customer.phone ||
          order.phone ||
          order.shipping_address?.phone ||
          order.billing_address?.phone ||
          existingCustomer?.phone ||
          null;

        const { data: upsertedCustomer, error: customerError } = await supabaseAdmin
          .from("customers")
          .upsert(
            {
              shopify_customer_id: shopifyCustomerId,
              first_name: customer.first_name || null,
              last_name: customer.last_name || null,
              email: customer.email || order.email || null,
              phone: customerPhone,
              total_orders: newTotalOrders,
              total_spent: newTotalSpent,
            },
            {
              onConflict: "shopify_customer_id",
            }
          )
          .select("id")
          .single();

        if (customerError) {
          console.error("Error upserting customer from order webhook:", customerError);
        } else if (upsertedCustomer) {
          customerDbId = upsertedCustomer.id;
        }
      }
    }

    // 6. Upsert Order
    const { data: upsertedOrder, error: orderError } = await supabaseAdmin
      .from("orders")
      .upsert(
        {
          shopify_order_id: shopifyOrderId,
          customer_id: customerDbId,
          order_number: orderNumber,
          total_price: isNaN(totalPrice) ? 0 : totalPrice,
          financial_status: financialStatus,
          fulfillment_status: fulfillmentStatus,
          created_at: orderCreatedAt,
        },
        {
          onConflict: "shopify_order_id",
        }
      )
      .select("id")
      .single();

    if (orderError) {
      console.error("Error upserting order in webhook:", orderError);
      throw orderError;
    }

    // 7. Upsert Order Line Items
    const rawLineItems = Array.isArray(order.line_items) ? order.line_items : [];
    if (rawLineItems.length > 0) {
      // Clear previous line items for this order to ensure idempotency on updates
      await supabaseAdmin
        .from("order_line_items")
        .delete()
        .eq("order_id", upsertedOrder.id);

      const itemsToInsert = [];

      for (const item of rawLineItems) {
        const shopifyVariantId = parseShopifyId(item.variant_id);
        let variantDbId: string | null = null;

        if (shopifyVariantId) {
          const { data: dbVariant } = await supabaseAdmin
            .from("product_variants")
            .select("id")
            .eq("shopify_variant_id", shopifyVariantId)
            .maybeSingle();

          variantDbId = dbVariant?.id || null;
        }

        const quantity = item.quantity || 1;
        const price =
          item.price !== undefined && item.price !== null
            ? parseFloat(item.price)
            : 0;

        itemsToInsert.push({
          order_id: upsertedOrder.id,
          variant_id: variantDbId,
          quantity,
          price: isNaN(price) ? 0 : price,
        });
      }

      if (itemsToInsert.length > 0) {
        const { error: lineItemsError } = await supabaseAdmin
          .from("order_line_items")
          .insert(itemsToInsert);

        if (lineItemsError) {
          console.error("Error inserting order line items in webhook:", lineItemsError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      orderId: upsertedOrder.id,
      shopifyOrderId,
    });
  } catch (error: any) {
    console.error("Webhook processing error (orders):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process orders webhook" },
      { status: 200 }
    );
  }
}
