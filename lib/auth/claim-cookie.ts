import "server-only";
import crypto from "crypto";
import type { NextResponse, NextRequest } from "next/server";

export const CLAIM_COOKIE_NAME = "shop_claim";
export const CLAIM_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

export interface ClaimPayload {
  shopId: string;
  exp: number; // Unix timestamp in seconds
}

/**
 * Creates a signed claim token string for the given shopId with a 24-hour expiry.
 * Token format: <base64url(payload)>.<base64url(hmac)>
 * Fails closed if CLAIM_COOKIE_SECRET is missing.
 */
export function createClaimToken(shopId: string): string {
  if (!shopId || typeof shopId !== "string") {
    throw new Error("Invalid or missing shopId for claim token");
  }

  const secret = process.env.CLAIM_COOKIE_SECRET;
  if (!secret) {
    throw new Error("CLAIM_COOKIE_SECRET environment variable is missing");
  }

  const exp = Math.floor(Date.now() / 1000) + CLAIM_COOKIE_MAX_AGE_SECONDS;
  const payload: ClaimPayload = { shopId, exp };

  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data, "utf8")
    .digest("base64url");

  return `${data}.${signature}`;
}

/**
 * Verifies a signed claim token string using HMAC-SHA256 and timing-safe comparison.
 * Fails closed (returns null) if CLAIM_COOKIE_SECRET is missing, signature is invalid,
 * or token is expired.
 */
export function verifyClaimToken(token: string | null | undefined): ClaimPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const secret = process.env.CLAIM_COOKIE_SECRET;
  if (!secret) {
    return null; // Fail closed if secret is missing
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [data, signature] = parts;
  if (!data || !signature) {
    return null;
  }

  try {
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(data, "utf8")
      .digest("base64url");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payloadJson = Buffer.from(data, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as ClaimPayload;

    if (!payload.shopId || typeof payload.shopId !== "string" || typeof payload.exp !== "number") {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSeconds) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sets the signed claim cookie on a NextResponse.
 * Cookie is httpOnly, secure, sameSite=lax, path="/", maxAge=24 hours.
 */
export function setClaimCookie(response: NextResponse, shopId: string): void {
  const token = createClaimToken(shopId);
  response.cookies.set(CLAIM_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CLAIM_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Extracts and verifies the claim cookie from a Request or NextRequest.
 */
export function getClaimFromRequest(
  request: Request | NextRequest
): ClaimPayload | null {
  if ("cookies" in request && typeof (request as NextRequest).cookies?.get === "function") {
    const cookie = (request as NextRequest).cookies.get(CLAIM_COOKIE_NAME);
    if (cookie) {
      return verifyClaimToken(cookie.value);
    }
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((part) => {
      const [k, ...v] = part.trim().split("=");
      return [k, v.join("=")];
    })
  );

  return verifyClaimToken(cookies[CLAIM_COOKIE_NAME]);
}

/**
 * Clears the claim cookie from a NextResponse.
 */
export function clearClaimCookie(response: NextResponse): void {
  response.cookies.delete(CLAIM_COOKIE_NAME);
}

/**
 * Verifies Shopify query-string HMAC:
 * 1. Removes hmac parameter
 * 2. Sorts remaining parameters lexicographically by key
 * 3. Joins as key=value with &
 * 4. Computes HMAC-SHA256 with SHOPIFY_CLIENT_SECRET (hex)
 * 5. Compares using crypto.timingSafeEqual
 */
export function verifyShopifyQueryHmac(searchParams: URLSearchParams): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) {
    return false;
  }

  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("verifyShopifyQueryHmac: Missing SHOPIFY_CLIENT_SECRET");
    return false;
  }

  const pairs: [string, string][] = [];
  searchParams.forEach((value, key) => {
    if (key !== "hmac" && key !== "signature") {
      pairs.push([key, value]);
    }
  });

  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = pairs.map(([k, v]) => `${k}=${v}`).join("&");

  try {
    const digest = crypto
      .createHmac("sha256", secret)
      .update(message, "utf8")
      .digest("hex");

    const digestBuf = Buffer.from(digest, "utf8");
    const hmacBuf = Buffer.from(hmac, "utf8");

    if (digestBuf.length !== hmacBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(digestBuf, hmacBuf);
  } catch (err) {
    console.error("verifyShopifyQueryHmac error:", err);
    return false;
  }
}
