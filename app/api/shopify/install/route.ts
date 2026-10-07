import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyShopifyQueryHmac } from "@/lib/auth/claim-cookie";

export const dynamic = "force-dynamic";

const SHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // 1. Validate the shop query parameter against /^[a-z0-9][a-z0-9-]*.myshopify.com$/
  const shop = searchParams.get("shop");
  if (!shop || !SHOPIFY_DOMAIN_REGEX.test(shop)) {
    return new NextResponse("Invalid shop parameter", { status: 400 });
  }

  // 2. Verify query-string HMAC
  const hmac = searchParams.get("hmac");
  if (!hmac || !verifyShopifyQueryHmac(searchParams)) {
    return new NextResponse("Invalid HMAC signature", { status: 400 });
  }

  // 3. Generate random state nonce
  const state = crypto.randomBytes(16).toString("hex");

  // 4. Validate server environment configuration
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    console.error("Missing SHOPIFY_CLIENT_ID environment variable");
    return new NextResponse("Server configuration error: missing SHOPIFY_CLIENT_ID", {
      status: 500,
    });
  }

  const appUrl =
    process.env.SHOPIFY_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin;
  const redirectUri = `${appUrl}/api/shopify/callback`;

  // 5. Construct Shopify OAuth authorization URL
  const authorizeUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  // Add scope parameter only if SHOPIFY_SCOPES is explicitly set
  if (process.env.SHOPIFY_SCOPES && process.env.SHOPIFY_SCOPES.trim()) {
    authorizeUrl.searchParams.set("scope", process.env.SHOPIFY_SCOPES.trim());
  }

  // 6. Set httpOnly, secure, sameSite=lax cookie that lasts 10 minutes and redirect
  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return response;
}
