import crypto from "crypto";

/**
 * Validates Shopify webhook authenticity using HMAC-SHA256 with SHOPIFY_CLIENT_SECRET.
 *
 * @param rawBody - The raw UTF-8 string representation of the webhook request body
 * @param hmacHeader - The value of the X-Shopify-Hmac-Sha256 header
 * @returns boolean indicating whether the webhook payload is authentic
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null | undefined
): boolean {
  if (!hmacHeader) {
    return false;
  }

  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("verifyShopifyWebhook: Missing SHOPIFY_CLIENT_SECRET environment variable");
    return false;
  }

  try {
    const generatedHash = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");

    const generatedBuffer = Buffer.from(generatedHash, "utf8");
    const headerBuffer = Buffer.from(hmacHeader, "utf8");

    if (generatedBuffer.length !== headerBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(generatedBuffer, headerBuffer);
  } catch (error) {
    console.error("verifyShopifyWebhook: Error verifying HMAC:", error);
    return false;
  }
}
