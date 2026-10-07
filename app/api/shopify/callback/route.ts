import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyShopifyQueryHmac, setClaimCookie } from "@/lib/auth/claim-cookie";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setShopTokens } from "@/lib/shopify/shop-token";

export const dynamic = "force-dynamic";

const SHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // 1. Validate shop with the myshopify regex
  const shop = searchParams.get("shop");
  if (!shop || !SHOPIFY_DOMAIN_REGEX.test(shop)) {
    return new NextResponse("Invalid shop parameter", { status: 400 });
  }

  // 2. Verify query-string HMAC
  const hmac = searchParams.get("hmac");
  if (!hmac || !verifyShopifyQueryHmac(searchParams)) {
    return new NextResponse("Invalid HMAC signature", { status: 400 });
  }

  // 3. Verify state equals cookie using timing-safe comparison
  const state = searchParams.get("state");
  const stateCookie = request.cookies.get("shopify_oauth_state")?.value;

  if (!state || !stateCookie) {
    return new NextResponse("Missing OAuth state parameter or cookie", { status: 400 });
  }

  const stateBuf = Buffer.from(state, "utf8");
  const cookieBuf = Buffer.from(stateCookie, "utf8");

  if (
    stateBuf.length !== cookieBuf.length ||
    !crypto.timingSafeEqual(stateBuf, cookieBuf)
  ) {
    return new NextResponse("Invalid OAuth state parameter", { status: 400 });
  }

  // 4. Exchange code for access token
  const code = searchParams.get("code");
  if (!code) {
    return new NextResponse("Missing authorization code", { status: 400 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET environment variable");
    return new NextResponse("Server configuration error: missing credentials", {
      status: 500,
    });
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      expiring: 1,
    }),
  });

  if (!tokenRes.ok) {
    console.error("Shopify OAuth token exchange failed with status:", tokenRes.status);
    return new NextResponse("Failed to exchange authorization code", { status: 502 });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = Number(tokenData.expires_in);
  const refreshExpiresIn = Number(tokenData.refresh_token_expires_in);

  if (!accessToken || typeof accessToken !== "string") {
    console.error("Invalid or missing access_token in Shopify response");
    return new NextResponse("Invalid response from Shopify token endpoint", {
      status: 502,
    });
  }

  if (!refreshToken || typeof refreshToken !== "string") {
    console.error("Invalid or missing refresh_token in Shopify response");
    return new NextResponse("Invalid response from Shopify token endpoint: missing refresh token", {
      status: 502,
    });
  }

  // 5. Upsert shops row by shop_domain using admin client
  const { data: shopRecord, error: upsertError } = await supabaseAdmin
    .from("shops")
    .upsert(
      {
        shop_domain: shop,
        scopes: tokenData.scope || null,
        installed_at: new Date().toISOString(),
        uninstalled_at: null,
      },
      { onConflict: "shop_domain" }
    )
    .select("id")
    .single();

  if (upsertError || !shopRecord) {
    console.error("Failed to upsert shop in database:", upsertError?.message);
    return new NextResponse("Database error saving shop", { status: 500 });
  }

  // 6. Save expiring offline tokens to shop_credentials (updates cache)
  await setShopTokens(shopRecord.id, {
    accessToken,
    refreshToken,
    expiresIn,
    refreshExpiresIn,
  });

  // 7. Clear state cookie, set signed claim cookie, and redirect to /onboarding
  const appUrl =
    process.env.SHOPIFY_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin;
  const onboardingUrl = new URL("/onboarding", appUrl);
  const response = NextResponse.redirect(onboardingUrl.toString());

  // Clear state cookie
  response.cookies.delete("shopify_oauth_state");

  // Set signed claim cookie
  setClaimCookie(response, shopRecord.id);

  return response;
}
