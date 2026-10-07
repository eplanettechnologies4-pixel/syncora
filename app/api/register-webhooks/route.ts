import { NextResponse } from "next/server";
import { queryShopifyAdmin } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";

const TUNNEL_BASE_URL = "https://labor-sic-tackle-temple.trycloudflare.com";

const SUBSCRIPTIONS = [
  {
    topic: "PRODUCTS_CREATE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/products`,
  },
  {
    topic: "PRODUCTS_UPDATE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/products`,
  },
  {
    topic: "PRODUCTS_DELETE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/products-delete`,
  },
  {
    topic: "ORDERS_CREATE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/orders`,
  },
  {
    topic: "ORDERS_DELETE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/orders-delete`,
  },
  {
    topic: "CUSTOMERS_DELETE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/customers-delete`,
  },
  {
    topic: "INVENTORY_LEVELS_UPDATE",
    callbackUrl: `${TUNNEL_BASE_URL}/api/webhooks/inventory`,
  },
];

const WEBHOOK_CREATE_MUTATION = `
  mutation WebhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!
    $webhookSubscription: WebhookSubscriptionInput!
  ) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: $webhookSubscription
    ) {
      webhookSubscription {
        id
        topic
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function GET() {
  const results = [];

  for (const sub of SUBSCRIPTIONS) {
    try {
      const response = await queryShopifyAdmin(WEBHOOK_CREATE_MUTATION, {
        topic: sub.topic,
        webhookSubscription: {
          uri: sub.callbackUrl,
          format: "JSON",
        },
      });

      const payload = response?.data?.webhookSubscriptionCreate;
      const userErrors = payload?.userErrors || [];
      const createdSub = payload?.webhookSubscription;
      const alreadyExists = userErrors.some((e: any) =>
        e.message?.toLowerCase().includes("already been taken")
      );
      const success = (userErrors.length === 0 && !!createdSub) || alreadyExists;

      results.push({
        topic: sub.topic,
        callbackUrl: sub.callbackUrl,
        success,
        subscriptionId: createdSub?.id || (alreadyExists ? "already_active" : null),
        ...(userErrors.length > 0 ? { userErrors } : {}),
      });
    } catch (error: any) {
      results.push({
        topic: sub.topic,
        callbackUrl: sub.callbackUrl,
        success: false,
        error: error.message || "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}
