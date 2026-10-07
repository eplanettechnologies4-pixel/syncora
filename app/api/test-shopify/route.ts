import { NextResponse } from "next/server";
import { requireShopAccess } from "@/lib/auth/shop-context";
import { queryShopifyAdminForShop } from "@/lib/shopify/shop-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  let shopAccess;
  try {
    shopAccess = await requireShopAccess();
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 401;
    return NextResponse.json(
      { ok: false, error: err?.message || "Unauthorized" },
      { status }
    );
  }

  const { shopId } = shopAccess;

  const query = `
    query GetFirstFiveProducts {
      products(first: 5) {
        edges {
          node {
            id
            title
            status
          }
        }
      }
    }
  `;

  try {
    const result = await queryShopifyAdminForShop(shopId, query);
    return NextResponse.json({
      ok: true,
      data: result.data,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("Shopify API test connection failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Shopify API test connection failed",
      },
      { status: 500 }
    );
  }
}
