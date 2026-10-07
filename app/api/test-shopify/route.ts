import { NextResponse } from "next/server";
import { queryShopifyAdmin } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";

export async function GET() {
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
    const result = await queryShopifyAdmin(query);
    return NextResponse.json({
      success: true,
      data: result.data,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("Shopify API test connection failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
