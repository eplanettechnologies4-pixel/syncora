import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export class ReauthRequiredError extends Error {
  code = "reauth_required";
  constructor(message: string = "Store connection expired. Please reinstall the app from Shopify.") {
    super(message);
    this.name = "ReauthRequiredError";
    this.code = "reauth_required";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms when access token expires
}

// In-memory cache for shop tokens keyed by shopId
const tokenCache = new Map<string, CachedToken>();

// Two-minute buffer (120,000 ms)
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

export interface ShopTokensInput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

/**
 * Resolves the cleaned shop domain for a given shopId.
 */
async function getShopDomain(shopId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("shop_domain")
    .eq("id", shopId)
    .maybeSingle();

  if (error || !data?.shop_domain) {
    throw new Error(`Database error fetching shop domain for "${shopId}": ${error?.message || "Shop not found"}`);
  }

  return data.shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Saves new access and refresh tokens into shop_credentials and updates the in-memory cache.
 */
export async function setShopTokens(
  shopId: string,
  tokens: ShopTokensInput
): Promise<void> {
  if (!shopId || typeof shopId !== "string") {
    throw new Error("Invalid or missing shopId provided to setShopTokens");
  }
  if (!tokens?.accessToken || typeof tokens.accessToken !== "string") {
    throw new Error("Invalid or missing accessToken provided to setShopTokens");
  }
  if (!tokens?.refreshToken || typeof tokens.refreshToken !== "string") {
    throw new Error("Invalid or missing refreshToken provided to setShopTokens");
  }

  const now = Date.now();
  const expiresInSec =
    typeof tokens.expiresIn === "number" && !isNaN(tokens.expiresIn) && tokens.expiresIn > 0
      ? tokens.expiresIn
      : 3600;
  // Default to 90 days (7,776,000 seconds) if refreshExpiresIn is missing or invalid
  const refreshExpiresInSec =
    typeof tokens.refreshExpiresIn === "number" && !isNaN(tokens.refreshExpiresIn) && tokens.refreshExpiresIn > 0
      ? tokens.refreshExpiresIn
      : 7776000;

  const expiresAt = new Date(now + expiresInSec * 1000).toISOString();
  const refreshExpiresAt = new Date(now + refreshExpiresInSec * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("shop_credentials")
    .upsert(
      {
        shop_id: shopId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "shop_id" }
    );

  if (error) {
    throw new Error(`Failed to write shop credentials for shop "${shopId}": ${error.message}`);
  }

  // Update in-memory cache respecting expires_at
  tokenCache.set(shopId, {
    accessToken: tokens.accessToken,
    expiresAt: now + expiresInSec * 1000,
  });
}

/**
 * Clears the cached Shopify access token for a specific shop.
 */
export function invalidateShopToken(shopId: string): void {
  if (shopId) {
    tokenCache.delete(shopId);
  }
}

/**
 * Retrieves the Shopify Admin API access token for a specific shop.
 * 1. Checks in-memory cache: if valid for > 2 minutes and not forceRefresh, returns it.
 * 2. Reads the row from shop_credentials. If access token is valid for > 2 minutes and not forceRefresh, caches and returns it.
 * 3. Otherwise refreshes using refresh_token grant against shop's oauth/access_token endpoint.
 * 4. Compares-and-swaps (CAS) update in shop_credentials: where shop_id = ... and refresh_token = <the old one>.
 * 5. If CAS changes no rows or refresh fails: re-reads the row and uses the token another request already saved if it is valid.
 * 6. If row has no refresh_token or expires_at, or refresh token is expired or rejected: throws ReauthRequiredError.
 */
export async function getShopToken(shopId: string, forceRefresh: boolean = false): Promise<string> {
  if (!shopId || typeof shopId !== "string") {
    throw new Error("Invalid or missing shopId provided to getShopToken");
  }

  const now = Date.now();

  // 1. Check in-memory cache (respecting expires_at: valid for more than 2 minutes)
  if (!forceRefresh) {
    const cached = tokenCache.get(shopId);
    if (cached) {
      if (cached.expiresAt - now > EXPIRY_BUFFER_MS) {
        return cached.accessToken;
      }
      tokenCache.delete(shopId);
    }
  }

  // 2. Read the row from shop_credentials
  const { data, error } = await supabaseAdmin
    .from("shop_credentials")
    .select("access_token, refresh_token, expires_at, refresh_expires_at")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error retrieving credentials for shop "${shopId}": ${error.message}`);
  }

  if (!data) {
    throw new ReauthRequiredError(`No Shopify credentials found in shop_credentials for shop "${shopId}"`);
  }

  // If access token is still valid for more than 2 minutes, return it
  if (!forceRefresh && data.access_token && data.expires_at) {
    const expiresAtMs = new Date(data.expires_at).getTime();
    if (expiresAtMs - now > EXPIRY_BUFFER_MS) {
      tokenCache.set(shopId, {
        accessToken: data.access_token,
        expiresAt: expiresAtMs,
      });
      return data.access_token;
    }
  }

  // If the row has no refresh_token or expires_at, throw reauth_required
  if (!data.refresh_token || !data.expires_at) {
    throw new ReauthRequiredError(`Shop "${shopId}" credentials missing refresh_token or expires_at`);
  }

  // If refresh token is expired, throw reauth_required
  if (data.refresh_expires_at) {
    const refreshExpiresAtMs = new Date(data.refresh_expires_at).getTime();
    if (refreshExpiresAtMs <= now) {
      throw new ReauthRequiredError(`Shop "${shopId}" refresh token is expired`);
    }
  }

  // 3. Refresh using refresh_token grant against shop's oauth/access_token endpoint
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET environment variable");
  }

  const cleanDomain = await getShopDomain(shopId);
  const oldRefreshToken = data.refresh_token;

  let refreshRes: Response | null = null;
  let refreshFailed = false;
  let refreshRejected = false;

  try {
    refreshRes = await fetch(`https://${cleanDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: oldRefreshToken,
      }).toString(),
    });

    if (!refreshRes.ok) {
      refreshFailed = true;
      if (refreshRes.status === 401 || refreshRes.status === 400 || refreshRes.status === 403) {
        refreshRejected = true;
      }
    }
  } catch (networkErr) {
    refreshFailed = true;
  }

  // If refresh call succeeded, attempt compare-and-swap update
  if (!refreshFailed && refreshRes && refreshRes.ok) {
    try {
      const tokenData = await refreshRes.json();
      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token;
      const expiresInSec = Number(tokenData.expires_in) || 3600;
      const refreshExpiresInSec = Number(tokenData.refresh_token_expires_in) || 7776000;

      if (newAccessToken && newRefreshToken) {
        const updateTime = Date.now();
        const newExpiresAt = new Date(updateTime + expiresInSec * 1000).toISOString();
        const newRefreshExpiresAt = new Date(updateTime + refreshExpiresInSec * 1000).toISOString();

        // Compare-and-swap update: where shop_id = ... and refresh_token = <the old one>
        const { data: updatedRows, error: updateError } = await supabaseAdmin
          .from("shop_credentials")
          .update({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            expires_at: newExpiresAt,
            refresh_expires_at: newRefreshExpiresAt,
            updated_at: new Date(updateTime).toISOString(),
          })
          .eq("shop_id", shopId)
          .eq("refresh_token", oldRefreshToken)
          .select("access_token");

        if (!updateError && updatedRows && updatedRows.length > 0) {
          // Compare-and-swap succeeded!
          tokenCache.set(shopId, {
            accessToken: newAccessToken,
            expiresAt: updateTime + expiresInSec * 1000,
          });
          return newAccessToken;
        }
      }
    } catch {
      // JSON parse or CAS update failed
    }
  }

  // 4. If CAS update changed no rows, or refresh call failed:
  // Re-read the row and use the token another request already saved if it is valid
  const { data: reloaded, error: reloadError } = await supabaseAdmin
    .from("shop_credentials")
    .select("access_token, refresh_token, expires_at, refresh_expires_at")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!reloadError && reloaded?.access_token && reloaded?.expires_at) {
    const reloadedExpiresAtMs = new Date(reloaded.expires_at).getTime();
    if (reloadedExpiresAtMs - Date.now() > EXPIRY_BUFFER_MS) {
      tokenCache.set(shopId, {
        accessToken: reloaded.access_token,
        expiresAt: reloadedExpiresAtMs,
      });
      return reloaded.access_token;
    }
  }

  // 5. If the row has no refresh_token or expires_at, or refresh token is expired or rejected:
  // throw an error with code "reauth_required"
  if (
    !reloaded?.refresh_token ||
    !reloaded?.expires_at ||
    refreshRejected ||
    (reloaded?.refresh_expires_at && new Date(reloaded.refresh_expires_at).getTime() <= Date.now())
  ) {
    throw new ReauthRequiredError(`Shop "${shopId}" refresh token expired or rejected. Re-authentication required.`);
  }

  throw new ReauthRequiredError(`Shop "${shopId}" could not refresh token and no valid token found.`);
}
