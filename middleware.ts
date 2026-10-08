import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protect /dashboard and all /dashboard/* sub-routes
  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirectedFrom", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Check user_shops table to ensure user has at least one assigned shop
    const { data: userShops, error: shopsError } = await supabase
      .from("user_shops")
      .select("shop_id")
      .eq("user_id", user.id)
      .limit(1);

    if (shopsError) {
      console.warn("Could not verify user_shops in middleware:", shopsError);
    }

    if (shopsError || !userShops || userShops.length === 0) {
      // If a claim cookie is present, redirect to /onboarding so the user can claim their store.
      // The cookie is not verified here as /onboarding already verifies it.
      // Since /onboarding is outside the matcher, this cannot cause a redirect loop.
      if (request.cookies.has("shop_claim")) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/onboarding";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "no_store");
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Prevent redirect loop on /login:
  // A logged-in user visiting /login is forwarded to /dashboard ONLY if they have
  // at least one assigned shop in user_shops. If they have no assigned shops, we
  // check if they have a shop_claim cookie to route them to /onboarding, or let
  // /login render normally so they can see the ?error=no_store message and sign out.
  if (pathname === "/login" && user) {
    const { data: userShops } = await supabase
      .from("user_shops")
      .select("shop_id")
      .eq("user_id", user.id)
      .limit(1);

    if (userShops && userShops.length > 0) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    } else if (request.cookies.has("shop_claim")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match dashboard pages and login route only.
     * /signup, /forgot-password, /onboarding and /auth/callback are intentionally omitted
     * so they remain accessible and are never blocked or redirected for any user state.
     * Webhooks and internal API routes (/api/*) are intentionally excluded
     * so external services (Shopify) are not blocked.
     */
    "/dashboard",
    "/dashboard/:path*",
    "/login",
  ],
};
