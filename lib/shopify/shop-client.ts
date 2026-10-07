import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getShopToken } from "./shop-token";

/**
 * Shared API version constant for all Shopify Admin API requests across stores.
 */
export const SHOPIFY_API_VERSION = "2026-07";

interface DomainCacheEntry {
  domain: string;
  cachedAt: number;
}

const domainCache = new Map<string, DomainCacheEntry>();
const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Resolves the cleaned shop domain for a given shopId.
 */
async function getShopDomain(shopId: string): Promise<string> {
  const cached = domainCache.get(shopId);
  if (cached && Date.now() - cached.cachedAt < DOMAIN_CACHE_TTL_MS) {
    return cached.domain;
  }

  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("shop_domain")
    .eq("id", shopId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error fetching shop domain for "${shopId}": ${error.message}`);
  }

  if (!data || !data.shop_domain) {
    throw new Error(`Shop not found with ID "${shopId}"`);
  }

  const cleanDomain = data.shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  domainCache.set(shopId, { domain: cleanDomain, cachedAt: Date.now() });
  return cleanDomain;
}

/**
 * Executes a GraphQL query/mutation against the Shopify Admin API for a specific shop.
 *
 * 1. Resolves store domain from `shops`.
 * 2. Fetches access token for that store from `shop_credentials` using `getShopToken`.
 * 3. Handles Shopify API rate limiting / throttling (HTTP 429 and Retry-After header).
 * 4. Handles GraphQL errors and network response failures cleanly.
 *
 * @param shopId - The target shop's UUID in Supabase
 * @param query - The GraphQL query or mutation string
 * @param variables - Optional variables object for GraphQL
 * @returns The parsed JSON response from Shopify
 */
export async function queryShopifyAdminForShop<T = any>(
  shopId: string,
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  if (!shopId) {
    throw new Error("Missing shopId in queryShopifyAdminForShop");
  }

  const cleanDomain = await getShopDomain(shopId);
  const accessToken = await getShopToken(shopId);
  const graphqlUrl = `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    // 1. Handle HTTP 429 (Too Many Requests / Throttled)
    if (response.status === 429) {
      if (attempt < maxRetries) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : 1;
        const delayMs = Math.max(1000, (isNaN(retryAfterSec) ? 1 : retryAfterSec) * 1000 + 250);

        console.warn(
          `Shopify API throttled (429) for ${cleanDomain}. Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(`Shopify API rate limit exceeded (HTTP 429) for store "${cleanDomain}".`);
    }

    // 2. Handle non-200 HTTP response codes
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Shopify Admin GraphQL request failed for store "${cleanDomain}" [${response.status} ${response.statusText}]: ${errorBody}`
      );
    }

    const json = await response.json();

    // 3. Handle GraphQL-level throttling extension errors
    if (
      Array.isArray(json.errors) &&
      json.errors.some((e: any) =>
        e.message?.toLowerCase().includes("throttled") ||
        e.extensions?.code === "THROTTLED"
      )
    ) {
      if (attempt < maxRetries) {
        const delayMs = 1500 * (attempt + 1);
        console.warn(
          `Shopify GraphQL returned throttling error for ${cleanDomain}. Retrying in ${delayMs}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }

    return json;
  }

  throw new Error(`Shopify Admin GraphQL request timed out after retries for store "${cleanDomain}".`);
}
