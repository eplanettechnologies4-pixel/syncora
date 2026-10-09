import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

export class ShopAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ShopAccessError";
    this.status = status;
  }
}

export interface UserShopItem {
  id: string;
  domain: string;
  role: string;
}

export interface ShopContextResult {
  user: User;
  shopId: string;
  shopDomain: string;
  role: string;
  shops: UserShopItem[];
}

/**
 * Creates a server-side session client tied to the caller's request cookies.
 * Adheres to Supabase Row Level Security (RLS) under the authenticated session.
 */
function createSessionClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Can happen in Server Components where cookies are read-only.
        }
      },
    },
  });
}

/**
 * Server function to securely resolve and verify a user's access to a shop.
 *
 * 1. Checks logged-in session (throws 401 if unauthenticated).
 * 2. Loads authorized shops from `user_shops` for this user via the session client.
 * 3. Selects active shop (requestedShopId -> active_shop_id cookie -> user's first shop).
 * 4. Verifies the selected shop is strictly present in the user's authorized shops (throws 403 if not).
 * 5. Returns { user, shopId, shopDomain }.
 *
 * Never trust a shop ID originating from client input without running this check.
 */
export async function requireShopAccess(
  requestedShopId?: string | null
): Promise<ShopContextResult> {
  const supabase = createSessionClient();

  // 1. Authenticate user from session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ShopAccessError("Unauthorized: No active user session", 401);
  }

  // 2. Load the user's shops from user_shops joining shops table
  const { data: userShops, error: shopsError } = await supabase
    .from("user_shops")
    .select(
      `
      shop_id,
      role,
      shops (
        id,
        shop_domain
      )
    `
    )
    .eq("user_id", user.id);

  if (shopsError) {
    throw new ShopAccessError(
      `Failed to load user shops: ${shopsError.message}`,
      500
    );
  }

  if (!userShops || userShops.length === 0) {
    throw new ShopAccessError(
      "Forbidden: User has no authorized shops",
      403
    );
  }

  // 3. Resolve active shop ID:
  //    Priority: requestedShopId -> active_shop_id cookie (if valid) -> user's first shop
  let targetShopId: string;

  const explicitShopId = requestedShopId?.trim();

  if (explicitShopId) {
    const matched = userShops.find((entry) => entry.shop_id === explicitShopId);
    if (!matched) {
      throw new ShopAccessError(
        `Forbidden: Access denied to shop ID "${explicitShopId}"`,
        403
      );
    }
    targetShopId = explicitShopId;
  } else {
    const cookieStore = cookies();
    const cookieShopId = cookieStore.get("active_shop_id")?.value?.trim();

    const matchedCookieShop = cookieShopId
      ? userShops.find((entry) => entry.shop_id === cookieShopId)
      : null;

    if (matchedCookieShop) {
      targetShopId = matchedCookieShop.shop_id;
    } else {
      // If the shop id from the active_shop_id cookie is not one of the user's shops,
      // ignore the cookie and fall back to the user's first shop instead of throwing 403.
      targetShopId = userShops[0].shop_id;
    }
  }

  // 4. Verify the candidate shop ID exists in the user's authorized user_shops rows
  const matchedEntry = userShops.find((entry) => entry.shop_id === targetShopId);

  if (!matchedEntry) {
    throw new ShopAccessError(
      `Forbidden: Access denied to shop ID "${targetShopId}"`,
      403
    );
  }

  // Extract shopDomain from joined shops relation or fallback query
  let domain = (matchedEntry.shops as any)?.shop_domain;

  if (!domain) {
    const { data: shopRow } = await supabase
      .from("shops")
      .select("shop_domain")
      .eq("id", targetShopId)
      .maybeSingle();

    domain = shopRow?.shop_domain;
  }

  if (!domain) {
    throw new ShopAccessError(
      `Configuration error: Shop domain not found for shop ID "${targetShopId}"`,
      500
    );
  }

  const shops: UserShopItem[] = userShops.map((entry) => ({
    id: entry.shop_id,
    domain: (entry.shops as any)?.shop_domain || "",
    role: entry.role,
  }));

  return {
    user,
    shopId: targetShopId,
    shopDomain: domain,
    role: matchedEntry.role || "admin",
    shops,
  };
}
