import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyShopifyWebhook } from "./verify-webhook";

export interface ShopRow {
  id: string;
  shop_domain: string;
  scopes: string | null;
  installed_at: string;
  uninstalled_at: string | null;
}

export type WebhookResolutionResult =
  | { ok: false; status: number }
  | { ok: true; shop: ShopRow; topic: string; rawBody: string };

/**
 * Resolves the matching `shops` record from an incoming Shopify webhook request.
 * Reads the `x-shopify-shop-domain` header and queries Supabase using `supabaseAdmin`.
 * Ignores any shops where `uninstalled_at` is not null.
 *
 * @param request - The incoming Webhook Request (standard Request or NextRequest)
 * @returns The matching Shop row, or null if missing, uninstalled, or not registered
 */
export async function resolveShopFromWebhook(
  request: Request
): Promise<ShopRow | null> {
  const shopDomainHeader =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain");

  if (!shopDomainHeader || !shopDomainHeader.trim()) {
    return null;
  }

  const cleanDomain = shopDomainHeader
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("id, shop_domain, scopes, installed_at, uninstalled_at")
    .eq("shop_domain", cleanDomain)
    .is("uninstalled_at", null)
    .maybeSingle();

  if (error) {
    console.error(`Error resolving shop for domain "${cleanDomain}":`, error);
    return null;
  }

  return data as ShopRow | null;
}

/**
 * Validates and resolves an incoming Shopify webhook request.
 * 1. Reads the raw body once
 * 2. Verifies the x-shopify-hmac-sha256 header using timing-safe comparison with SHOPIFY_CLIENT_SECRET
 * 3. Only then resolves the shop from x-shopify-shop-domain (ignoring uninstalled shops)
 * 4. Returns { ok: false, status } on any failure, or { ok: true, shop, topic, rawBody }
 *
 * @param request - The incoming HTTP Request
 */
export async function verifyAndResolveWebhook(
  request: Request
): Promise<WebhookResolutionResult> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error("verifyAndResolveWebhook: Failed to read request body:", err);
    return { ok: false, status: 400 };
  }

  const hmacHeader =
    request.headers.get("x-shopify-hmac-sha256") ||
    request.headers.get("X-Shopify-Hmac-Sha256");

  if (!hmacHeader || !verifyShopifyWebhook(rawBody, hmacHeader)) {
    return { ok: false, status: 401 };
  }

  const shopDomainHeader =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain");

  if (!shopDomainHeader || !shopDomainHeader.trim()) {
    return { ok: false, status: 400 };
  }

  const shop = await resolveShopFromWebhook(request);
  if (!shop) {
    return { ok: false, status: 404 };
  }

  const topic =
    request.headers.get("x-shopify-topic") ||
    request.headers.get("X-Shopify-Topic") ||
    "";

  return {
    ok: true,
    shop,
    topic,
    rawBody,
  };
}
