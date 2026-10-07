import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/verify-webhook";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function parseShopifyId(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = String(val);
  const parts = str.split("/");
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 0 : num;
}

export async function POST(request: NextRequest) {
  // 1. Read raw body as text FIRST for HMAC verification
  const rawBody = await request.text();

  // 2. Get HMAC header
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  // 3. Verify HMAC authenticity
  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn("Unauthorized webhook request (products-delete): Invalid HMAC signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Parse JSON payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse products-delete webhook JSON payload:", err);
    return new NextResponse("Bad Request: Invalid JSON", { status: 400 });
  }

  try {
    const shopifyProductId = parseShopifyId(payload.id);
    if (!shopifyProductId) {
      console.warn("Product delete webhook received without product id:", payload);
      return NextResponse.json(
        { success: false, message: "Missing product ID in payload" },
        { status: 200 }
      );
    }

    // 5. Look up matching product in Supabase
    const { data: existingProduct, error: findError } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("shopify_product_id", shopifyProductId)
      .maybeSingle();

    if (findError) {
      console.error("Error looking up product to delete:", findError);
      throw findError;
    }

    if (!existingProduct) {
      console.log(`Product with shopify_product_id ${shopifyProductId} not found in database; already deleted or never synced.`);
      return NextResponse.json(
        { success: true, message: "Product not found in database", shopifyProductId },
        { status: 200 }
      );
    }

    // 6. Delete associated inventory and variants cleanly before deleting product
    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select("id")
      .eq("product_id", existingProduct.id);

    const variantIds = (variants || []).map((v) => v.id);

    if (variantIds.length > 0) {
      // Clean up inventory rows
      await supabaseAdmin
        .from("inventory")
        .delete()
        .in("variant_id", variantIds);

      // Nullify variant_id on order_line_items if any reference this variant
      await supabaseAdmin
        .from("order_line_items")
        .update({ variant_id: null })
        .in("variant_id", variantIds);

      // Clean up product variants
      await supabaseAdmin
        .from("product_variants")
        .delete()
        .eq("product_id", existingProduct.id);
    }

    // 7. Delete the product row
    const { error: deleteError } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", existingProduct.id);

    if (deleteError) {
      console.error("Error deleting product:", deleteError);
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      message: "Product and associated data deleted successfully",
      shopifyProductId,
    });
  } catch (error: any) {
    console.error("Webhook processing error (products-delete):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process products-delete webhook" },
      { status: 200 }
    );
  }
}
