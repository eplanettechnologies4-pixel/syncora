import React from "react";
import { supabaseServer } from "@/lib/supabase/server";
import DispatchForm, { DispatchableItem } from "@/components/dispatch/DispatchForm";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  // Fetch variants and their current stock from inventory table
  const { data: inventoryRows, error } = await supabaseServer
    .from("inventory")
    .select(
      `
      id,
      variant_id,
      quantity,
      product_variants (
        id,
        shopify_variant_id,
        title,
        sku,
        price,
        products (
          id,
          title,
          image_url,
          price_min
        )
      )
    `
    )
    .order("quantity", { ascending: false });

  if (error) {
    console.error("Error fetching inventory for dispatch form:", error);
  }

  const availableItems: DispatchableItem[] = (inventoryRows || [])
    .map((row: any) => {
      const variant = row.product_variants;
      const product = variant?.products;
      if (!variant || !row.variant_id) return null;

      const unitPrice =
        typeof variant.price === "number" && variant.price > 0
          ? variant.price
          : typeof product?.price_min === "number" && product.price_min > 0
          ? product.price_min
          : 0;

      return {
        variantId: row.variant_id,
        productTitle: product?.title || "Unknown Product",
        variantTitle: variant.title || "Default Title",
        sku: variant.sku || null,
        stock: typeof row.quantity === "number" ? row.quantity : 0,
        price: unitPrice,
        imageUrl: product?.image_url || null,
      };
    })
    .filter(Boolean) as DispatchableItem[];

  return (
    <div className="space-y-6">
      <DispatchForm availableItems={availableItems} />
    </div>
  );
}
