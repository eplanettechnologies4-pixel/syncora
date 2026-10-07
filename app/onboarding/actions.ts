"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClaimFromRequest, CLAIM_COOKIE_NAME } from "@/lib/auth/claim-cookie";

async function getAuthenticatedUser() {
  const cookieStore = cookies();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // Handled safely
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }
  return user;
}

/**
 * Server action to link a shop from a verified claim cookie to the authenticated user.
 * Never accepts a shop id from form data or external input.
 */
export async function connectShopAction() {
  const cookieStore = cookies();

  // 1. Verify the claim cookie again (never accept shop id from form data)
  const claim = getClaimFromRequest({
    cookies: cookieStore,
    headers: new Headers({ cookie: cookieStore.toString() }),
  } as any);

  if (!claim || !claim.shopId) {
    redirect(
      "/onboarding?error=" +
        encodeURIComponent(
          "Invalid or expired store install claim. Please reinstall from Shopify."
        )
    );
  }

  const shopId = claim.shopId;

  // 2. Verify the user with getUser()
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirectedFrom=/onboarding");
  }

  // 3. Admin client check and membership assignment:
  // - If the shop has zero rows in user_shops, insert (user_id, shop_id, role 'owner')
  // - If the user already has a row for that shop, succeed without inserting
  // - If the shop has other members and this user is not one of them, refuse with an error message and do not link
  const { data: existingRows, error: fetchError } = await supabaseAdmin
    .from("user_shops")
    .select("user_id, shop_id, role")
    .eq("shop_id", shopId);

  if (fetchError) {
    console.error("Failed to query user_shops:", fetchError.message);
    redirect(
      "/onboarding?error=" +
        encodeURIComponent("Database error verifying store membership.")
    );
  }

  const rows = existingRows || [];

  if (rows.length === 0) {
    // Zero rows: claim store as owner
    const { error: insertError } = await supabaseAdmin
      .from("user_shops")
      .insert({
        user_id: user.id,
        shop_id: shopId,
        role: "owner",
      });

    if (insertError) {
      console.error("Failed to insert user_shops owner row:", insertError.message);
      redirect(
        "/onboarding?error=" +
          encodeURIComponent("Failed to connect store to account.")
      );
    }
  } else {
    // Check if user is already a member of this shop
    const isMember = rows.some((row) => row.user_id === user.id);
    if (!isMember) {
      // Store belongs to other users and caller is not a member -> refuse
      redirect(
        "/onboarding?error=" +
          encodeURIComponent(
            "This store is already connected to another owner. Please contact your store administrator for access."
          )
      );
    }
    // If user is already a member, succeed without inserting
  }

  // 4. Clear claim cookie, set active_shop_id cookie, and redirect to /dashboard
  cookieStore.delete(CLAIM_COOKIE_NAME);

  cookieStore.set("active_shop_id", shopId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  redirect("/dashboard");
}
