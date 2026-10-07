interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let cachedToken: CachedToken | null = null;

/**
 * Retrieves a valid Shopify Admin API access token using the Client Credentials grant flow.
 * Caches the token in memory until 60 seconds before expiration.
 */
export async function getAccessToken(): Promise<string> {
  // Check if existing token is cached and valid (with 60-second safety window)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.accessToken;
  }

  const rawDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!rawDomain || !clientId || !clientSecret) {
    throw new Error(
      "Missing Shopify credentials in environment variables: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET"
    );
  }

  const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const tokenUrl = `https://${cleanDomain}/admin/oauth/access_token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to obtain Shopify access token [${response.status} ${response.statusText}]: ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error("Shopify token response missing access_token");
  }

  // expires_in is given in seconds (typically 86399 or 24 hours)
  const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 86400;
  const expiresAt = Date.now() + expiresInSeconds * 1000;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt,
  };

  return cachedToken.accessToken;
}
