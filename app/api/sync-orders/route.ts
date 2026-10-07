import { NextRequest, NextResponse } from "next/server";
import { requireShopAccess } from "@/lib/auth/shop-context";
import { queryShopifyAdminForShop } from "@/lib/shopify/shop-client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseShopifyId(gidOrNum: any): number {
  if (typeof gidOrNum === "number") return gidOrNum;
  if (!gidOrNum) return 0;
  const parts = String(gidOrNum).split("/");
  const numStr = parts[parts.length - 1];
  const parsed = parseInt(numStr, 10);
  return isNaN(parsed) ? 0 : parsed;
}

interface ShopifyOrdersResponse {
  data?: {
    orders?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      edges: Array<{
        node: {
          id: string;
          name: string;
          createdAt: string;
          totalPriceSet?: {
            shopMoney?: {
              amount: string;
            };
          };
          displayFinancialStatus: string | null;
          displayFulfillmentStatus: string | null;
          customer?: {
            id: string;
            firstName: string | null;
            lastName: string | null;
            email: string | null;
            phone: string | null;
          } | null;
          lineItems?: {
            edges: Array<{
              node: {
                id: string;
                quantity: number;
                originalUnitPriceSet?: {
                  shopMoney?: {
                    amount: string;
                  };
                };
                variant?: {
                  id: string;
                  title: string;
                } | null;
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
    console.error("sync-orders: unauthorized", err?.message || "No shop access");
    return NextResponse.json(
      { ok: false, error: "sync-orders: unauthorized" },
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
    query GetOrdersForSync($cursor: String) {
      orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
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
    let currentCursor: string | null = startCursor;
    let hasMore = false;
    let ordersSynced = 0;
    const syncedCustomerIds = new Set<number>();

    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      let response: ShopifyOrdersResponse;
      try {
        response = await queryShopifyAdminForShop(
          shopId,
          query,
          { cursor: currentCursor }
        );
      } catch (err: any) {
        if (err?.message?.includes("No Shopify access token found")) {
          console.error("sync-orders: no token", err.message);
          return NextResponse.json(
            { ok: false, error: "sync-orders: no token" },
            { status: 401 }
          );
        }
        const statusMatch = err?.message?.match(/\[(\d{3})\b/);
        const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 502;
        console.error("sync-orders: shopify request failed", httpStatus, err?.message || "Request failed");
        return NextResponse.json(
          { ok: false, error: "sync-orders: shopify request failed" },
          { status: httpStatus }
        );
      }

      if (response.errors && response.errors.length > 0) {
        console.error("sync-orders: shopify request failed", 502, response.errors[0]?.message || "GraphQL errors");
        return NextResponse.json(
          { ok: false, error: "sync-orders: shopify request failed" },
          { status: 502 }
        );
      }

      const ordersData = response.data?.orders;
      const orderEdges = ordersData?.edges || [];

      // Group customer metrics within this batch
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
          syncedCustomerIds.add(cId);
        }
      }

      // Upsert customers with shop_id and composite onConflict
      const customerDbMap = new Map<number, string>();
      for (const [shopifyCustomerId, metrics] of Array.from(customerMetrics.entries())) {
        const { data: upsertedCustomer, error: cErr } = await supabaseAdmin
          .from("customers")
          .upsert(
            {
              shop_id: shopId,
              shopify_customer_id: shopifyCustomerId,
              first_name: metrics.firstName,
              last_name: metrics.lastName,
              email: metrics.email,
              phone: metrics.phone,
              total_orders: metrics.totalOrders,
              total_spent: Number(metrics.totalSpent.toFixed(2)),
            },
            {
              onConflict: "shop_id,shopify_customer_id",
            }
          )
          .select("id")
          .single();

        if (cErr) {
          console.error("sync-orders: customers upsert failed", cErr.code, cErr.message);
          return NextResponse.json(
            { ok: false, error: "sync-orders: customers upsert failed" },
            { status: 500 }
          );
        }

        if (upsertedCustomer) {
          customerDbMap.set(shopifyCustomerId, upsertedCustomer.id);
        }
      }

      // Upsert orders and line items
      for (const edge of orderEdges) {
        const order = edge.node;
        const shopifyOrderId = parseShopifyId(order.id);
        const shopifyCustomerId = order.customer?.id ? parseShopifyId(order.customer.id) : null;

        let customerDbId = shopifyCustomerId ? customerDbMap.get(shopifyCustomerId) || null : null;
        if (!customerDbId && shopifyCustomerId) {
          const { data: existingCustomer } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("shop_id", shopId)
            .eq("shopify_customer_id", shopifyCustomerId)
            .maybeSingle();

          customerDbId = existingCustomer?.id || null;
        }

        const rawPrice = order.totalPriceSet?.shopMoney?.amount;
        const totalPrice = rawPrice ? parseFloat(rawPrice) : 0;
        const financialStatus = order.displayFinancialStatus
          ? order.displayFinancialStatus.toLowerCase()
          : "pending";
        const fulfillmentStatus = order.displayFulfillmentStatus
          ? order.displayFulfillmentStatus.toLowerCase()
          : "unfulfilled";

        const { data: upsertedOrder, error: orderError } = await supabaseAdmin
          .from("orders")
          .upsert(
            {
              shop_id: shopId,
              shopify_order_id: shopifyOrderId,
              customer_id: customerDbId,
              order_number: order.name || `#${shopifyOrderId}`,
              total_price: isNaN(totalPrice) ? 0 : totalPrice,
              financial_status: financialStatus,
              fulfillment_status: fulfillmentStatus,
              created_at: order.createdAt || new Date().toISOString(),
            },
            {
              onConflict: "shop_id,shopify_order_id",
            }
          )
          .select("id")
          .single();

        if (orderError || !upsertedOrder) {
          console.error("sync-orders: orders upsert failed", orderError?.code, orderError?.message);
          return NextResponse.json(
            { ok: false, error: "sync-orders: orders upsert failed" },
            { status: 500 }
          );
        }

        // Line items: delete and insert filtered by shop_id
        const lineItemEdges = order.lineItems?.edges || [];
        if (lineItemEdges.length > 0) {
          await supabaseAdmin
            .from("order_line_items")
            .delete()
            .eq("shop_id", shopId)
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
                .eq("shop_id", shopId)
                .eq("shopify_variant_id", shopifyVariantId)
                .maybeSingle();

              variantDbId = dbVariant?.id || null;
            }

            const rawItemPrice = item.originalUnitPriceSet?.shopMoney?.amount;
            const itemPrice = rawItemPrice ? parseFloat(rawItemPrice) : 0;

            itemsToInsert.push({
              shop_id: shopId,
              order_id: upsertedOrder.id,
              variant_id: variantDbId,
              quantity: item.quantity || 1,
              price: isNaN(itemPrice) ? 0 : itemPrice,
            });
          }

          if (itemsToInsert.length > 0) {
            const { error: lineItemError } = await supabaseAdmin
              .from("order_line_items")
              .insert(itemsToInsert);

            if (lineItemError) {
              console.error("sync-orders: line items upsert failed", lineItemError.code, lineItemError.message);
              return NextResponse.json(
                { ok: false, error: "sync-orders: line items upsert failed" },
                { status: 500 }
              );
            }
          }
        }

        ordersSynced++;
      }

      const pageInfo = ordersData?.pageInfo;
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
        ordersSynced,
        customersSynced: syncedCustomerIds.size,
      },
      hasMore,
      cursor: hasMore ? currentCursor : null,
    });
  } catch (error: any) {
    if (error?.message?.includes("No Shopify access token found")) {
      console.error("sync-orders: no token", error.message);
      return NextResponse.json(
        { ok: false, error: "sync-orders: no token" },
        { status: 401 }
      );
    }
    const statusMatch = error?.message?.match(/\[(\d{3})\b/);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    console.error("sync-orders: shopify request failed", httpStatus, error?.message || "Unknown error");
    return NextResponse.json(
      { ok: false, error: "sync-orders: shopify request failed" },
      { status: httpStatus }
    );
  }
}
