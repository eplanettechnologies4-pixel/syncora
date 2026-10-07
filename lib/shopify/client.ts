import { getAccessToken } from "./token";

/**
 * Executes a GraphQL query against the Shopify Admin API (version 2026-07).
 *
 * @param query - The GraphQL query string
 * @param variables - Optional variables for the GraphQL query
 * @returns The parsed JSON response from Shopify Admin API
 */
export async function queryShopifyAdmin<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const accessToken = await getAccessToken();

  const rawDomain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!rawDomain) {
    throw new Error("Missing SHOPIFY_STORE_DOMAIN environment variable");
  }

  const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const graphqlUrl = `https://${cleanDomain}/admin/api/2026-07/graphql.json`;

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Shopify Admin GraphQL request failed [${response.status} ${response.statusText}]: ${errorBody}`
    );
  }

  return response.json();
}
