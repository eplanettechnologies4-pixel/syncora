import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface CachedToken {
  accessToken: string;
  cachedAt: number;
}

// In-memory cache for shop tokens (5-minute TTL) to reduce redundant DB reads
const tokenCache = new Map<string, CachedToken>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Retrieves the Shopify Admin API access token for a specific shop.
 * Reads the token securely from the `shop_credentials` table using `supabaseAdmin`.
 * Does not rely on any environment-based store domains.
 *
 * @param shopId - The UUID of the shop in Supabase
 * @returns The decrypted/stored Shopify Admin access token
 */
export async function getShopToken(shopId: string): Promise<string> {
  if (!shopId || typeof shopId !== "string") {
    throw new Error("Invalid or missing shopId provided to getShopToken");
  }

  // Check in-memory cache
  const cached = tokenCache.get(shopId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.accessToken;
  }

  // Fetch access token from shop_credentials using the admin client
  const { data, error } = await supabaseAdmin
    .from("shop_credentials")
    .select("access_token")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error retrieving credentials for shop "${shopId}": ${error.message}`);
  }

  if (!data || !data.access_token) {
    throw new Error(`No Shopify access token found in shop_credentials for shop "${shopId}"`);
  }

  tokenCache.set(shopId, {
    accessToken: data.access_token,
    cachedAt: Date.now(),
  });

  return data.access_token;
}

/**
 * Clears the cached Shopify access token for a specific shop.
 *
 * @param shopId - The UUID of the shop in Supabase
 */
export function invalidateShopToken(shopId: string): void {
  if (shopId) {
    tokenCache.delete(shopId);
  }
}

/**
 * Writes or updates the Shopify access token in shop_credentials using the admin client,
 * and clears the in-memory cache for that shop.
 *
 * @param shopId - The UUID of the shop in Supabase
 * @param token - The Shopify Admin API access token
 */
export async function setShopToken(shopId: string, token: string): Promise<void> {
  if (!shopId || typeof shopId !== "string") {
    throw new Error("Invalid or missing shopId provided to setShopToken");
  }
  if (!token || typeof token !== "string") {
    throw new Error("Invalid or missing token provided to setShopToken");
  }

  const { error } = await supabaseAdmin
    .from("shop_credentials")
    .upsert(
      {
        shop_id: shopId,
        access_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id" }
    );

  if (error) {
    throw new Error(`Failed to write shop credentials for shop "${shopId}": ${error.message}`);
  }

  invalidateShopToken(shopId);
}

