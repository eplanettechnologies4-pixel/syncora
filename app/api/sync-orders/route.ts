import { NextResponse } from "next/server";
import { queryShopifyAdmin } from "@/lib/shopify/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function parseShopifyId(gidOrNum: any): number {
  if (typeof gidOrNum === "number") return gidOrNum;
  if (!gidOrNum) return 0;
  const parts = String(gidOrNum).split("/");
  const numStr = parts[parts.length - 1];
  const parsed = parseInt(numStr, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export async function GET() {
  const query = `
    query GetOrdersForSync {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
              }
            }
            displayFinancialStatus
            displayFulfillmentStatus
            customer {
              id
              firstName
              lastName
              email
              phone
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    id
                    title
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

    const orderEdges = response.data?.orders?.edges || [];
    let ordersSynced = 0;

    // Group customer metrics to calculate accurate total_orders and total_spent
    const customerMetrics = new Map<
      number,
      {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        totalOrders: number;
        totalSpent: number;
      }
    >();

    for (const edge of orderEdges) {
      const order = edge.node;
      const rawPrice = order.totalPriceSet?.shopMoney?.amount;
      const orderPrice = rawPrice ? parseFloat(rawPrice) : 0;

      if (order.customer?.id) {
        const cId = parseShopifyId(order.customer.id);
        const existing = customerMetrics.get(cId) || {
          firstName: order.customer.firstName || null,
          lastName: order.customer.lastName || null,
          email: order.customer.email || null,
          phone: order.customer.phone || null,
          totalOrders: 0,
          totalSpent: 0,
        };

        existing.totalOrders += 1;
        existing.totalSpent += isNaN(orderPrice) ? 0 : orderPrice;
        if (!existing.phone && order.customer.phone) {
          existing.phone = order.customer.phone;
        }
        customerMetrics.set(cId, existing);
      }
    }

    // Upsert all customers with their calculated total_orders and total_spent
    const customerDbMap = new Map<number, string>();
    for (const [shopifyCustomerId, metrics] of Array.from(customerMetrics.entries())) {
      const { data: upsertedCustomer, error: cErr } = await supabaseAdmin
        .from("customers")
        .upsert(
          {
            shopify_customer_id: shopifyCustomerId,
            first_name: metrics.firstName,
            last_name: metrics.lastName,
            email: metrics.email,
            phone: metrics.phone,
            total_orders: metrics.totalOrders,
            total_spent: Number(metrics.totalSpent.toFixed(2)),
          },
          {
            onConflict: "shopify_customer_id",
          }
        )
        .select("id")
        .single();

      if (!cErr && upsertedCustomer) {
        customerDbMap.set(shopifyCustomerId, upsertedCustomer.id);
      }
    }

    // Now upsert orders and line items
    for (const edge of orderEdges) {
      const order = edge.node;
      const shopifyOrderId = parseShopifyId(order.id);
      const shopifyCustomerId = order.customer?.id ? parseShopifyId(order.customer.id) : null;
      const customerDbId = shopifyCustomerId ? customerDbMap.get(shopifyCustomerId) || null : null;

      const rawPrice = order.totalPriceSet?.shopMoney?.amount;
      const totalPrice = rawPrice ? parseFloat(rawPrice) : 0;
      const financialStatus = order.displayFinancialStatus ? order.displayFinancialStatus.toLowerCase() : "pending";
      const fulfillmentStatus = order.displayFulfillmentStatus ? order.displayFulfillmentStatus.toLowerCase() : "unfulfilled";

      const { data: upsertedOrder, error: orderError } = await supabaseAdmin
        .from("orders")
        .upsert(
          {
            shopify_order_id: shopifyOrderId,
            customer_id: customerDbId,
            order_number: order.name || `#${shopifyOrderId}`,
            total_price: isNaN(totalPrice) ? 0 : totalPrice,
            financial_status: financialStatus,
            fulfillment_status: fulfillmentStatus,
            created_at: order.createdAt || new Date().toISOString(),
          },
          {
            onConflict: "shopify_order_id",
          }
        )
        .select("id")
        .single();

      if (orderError || !upsertedOrder) {
        console.error("Error upserting order during sync:", orderError);
        continue;
      }

      // Upsert Line items
      const lineItemEdges = order.lineItems?.edges || [];
      if (lineItemEdges.length > 0) {
        await supabaseAdmin
          .from("order_line_items")
          .delete()
          .eq("order_id", upsertedOrder.id);

        const itemsToInsert = [];
        for (const itemEdge of lineItemEdges) {
          const item = itemEdge.node;
          const variantGid = item.variant?.id;
          let variantDbId: string | null = null;

          if (variantGid) {
            const shopifyVariantId = parseShopifyId(variantGid);
            const { data: dbVariant } = await supabaseAdmin
              .from("product_variants")
              .select("id")
              .eq("shopify_variant_id", shopifyVariantId)
              .maybeSingle();

            variantDbId = dbVariant?.id || null;
          }

          const rawItemPrice = item.originalUnitPriceSet?.shopMoney?.amount;
          const itemPrice = rawItemPrice ? parseFloat(rawItemPrice) : 0;

          itemsToInsert.push({
            order_id: upsertedOrder.id,
            variant_id: variantDbId,
            quantity: item.quantity || 1,
            price: isNaN(itemPrice) ? 0 : itemPrice,
          });
        }

        if (itemsToInsert.length > 0) {
          await supabaseAdmin.from("order_line_items").insert(itemsToInsert);
        }
      }

      ordersSynced++;
    }

    return NextResponse.json({
      success: true,
      ordersSynced,
      customersSynced: customerMetrics.size,
    });
  } catch (error: any) {
    console.error("Order sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to sync orders" },
      { status: 500 }
    );
  }
}
