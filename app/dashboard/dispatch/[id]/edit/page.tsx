import React from "react";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import DispatchForm, {
  DispatchableItem,
  DispatchEditData,
} from "@/components/dispatch/DispatchForm";

export const dynamic = "force-dynamic";

interface EditReceiptPageProps {
  params: {
    id: string;
  };
}

export default async function EditDispatchReceiptPage({ params }: EditReceiptPageProps) {
  const { id } = params;

  // 1. Fetch dispatch details
  const { data: dispatch, error: dispatchErr } = await supabaseServer
    .from("manual_dispatches")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (dispatchErr || !dispatch) {
    notFound();
  }

  // 2. Fetch dispatch line items
  const { data: dispatchItems, error: itemsErr } = await supabaseServer
    .from("manual_dispatch_items")
    .select(
      `
      id,
      quantity,
      variant_id,
      product_variants (
        id,
        shopify_variant_id,
        title,
        price,
        products (
          id,
          title,
          price_min
        )
      )
    `
    )
    .eq("dispatch_id", id);

  if (itemsErr) {
    console.error("Error fetching dispatch items for edit:", itemsErr);
  }

  // 3. Fetch warehouse inventory
  const { data: inventoryRows, error: invErr } = await supabaseServer
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

  if (invErr) {
    console.error("Error fetching inventory for dispatch edit form:", invErr);
  }

  // 4. Map existing quantities in this dispatch by variant_id
  const existingQtyMap = new Map<string, number>();
  (dispatchItems || []).forEach((row: any) => {
    if (row.variant_id) {
      existingQtyMap.set(
        row.variant_id,
        (existingQtyMap.get(row.variant_id) || 0) + (row.quantity || 0)
      );
    }
  });

  // 5. Build availableItems, adding back the units currently allocated in this dispatch
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

      // Allow keeping or expanding up to current warehouse stock + already allocated in this dispatch
      const inThisDispatch = existingQtyMap.get(row.variant_id) || 0;
      const baseStock = typeof row.quantity === "number" ? row.quantity : 0;
      const effectiveStock = baseStock + inThisDispatch;

      return {
        variantId: row.variant_id,
        productTitle: product?.title || "Unknown Product",
        variantTitle: variant.title || "Default Title",
        sku: variant.sku || null,
        stock: effectiveStock,
        price: unitPrice,
        imageUrl: product?.image_url || null,
      };
    })
    .filter(Boolean) as DispatchableItem[];

  // 6. Parse dispatch notes JSON metadata
  let displayNotes = dispatch.notes || "";
  let paymentStatus: "paid" | "unpaid" = "unpaid";
  let packagingType: "TUBES" | "JAR" | "TUBE + JAR" = "TUBES";
  let parsedAddress: string | null = null;
  let parsedPhone: string | null = null;
  let parsedDispatchDate: string | null = null;
  let pricingData: {
    subtotal?: number;
    discount?: { type: "percentage" | "fixed"; value: number; amount: number };
    totalAmount?: number;
    items?: Array<{ variantId: string; quantity: number; unitPrice: number; totalPrice: number; packSize?: string }>;
  } | null = null;

  if (dispatch.notes && typeof dispatch.notes === "string" && dispatch.notes.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(dispatch.notes);
      if (parsed && typeof parsed === "object") {
        displayNotes = parsed.text || "";
        paymentStatus = parsed.paymentStatus === "paid" ? "paid" : "unpaid";
        pricingData = parsed.pricing || null;
        if (typeof parsed.packagingType === "string" && parsed.packagingType.trim()) {
          const upper = parsed.packagingType.trim().toUpperCase();
          if (upper === "JAR" || upper === "TUBE + JAR" || upper === "TUBES") {
            packagingType = upper as any;
          }
        }
        if (typeof parsed.dispatchDate === "string" && parsed.dispatchDate.trim()) {
          parsedDispatchDate = parsed.dispatchDate.trim();
        }
        if (typeof parsed.address === "string" && parsed.address.trim()) {
          parsedAddress = parsed.address.trim();
        }
        if (typeof parsed.phone === "string" && parsed.phone.trim()) {
          parsedPhone = parsed.phone.trim();
        }
      }
    } catch {
      // Keep plain text fallback
    }
  }

  // 7. Format date string for HTML date input: YYYY-MM-DD
  let inputDateStr = "";
  if (parsedDispatchDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedDispatchDate.trim())) {
    inputDateStr = parsedDispatchDate.trim();
  } else if (dispatch.created_at) {
    try {
      const d = new Date(dispatch.created_at);
      if (!isNaN(d.getTime())) {
        inputDateStr = d.toISOString().slice(0, 10);
      }
    } catch {}
  }

  // 8. Map custom line item unit prices & pack sizes
  const pricingMap = new Map<string, number>();
  const packSizeMap = new Map<string, string>();
  if (pricingData?.items) {
    pricingData.items.forEach((pItem: any) => {
      pricingMap.set(pItem.variantId, pItem.unitPrice);
      if (typeof pItem.packSize === "string" && pItem.packSize.trim()) {
        packSizeMap.set(pItem.variantId, pItem.packSize.trim());
      }
    });
  }

  const initialLineItems = (dispatchItems || []).map((row: any) => {
    const variant = row.product_variants;
    const product = variant?.products;
    const fallbackPrice =
      typeof variant?.price === "number" && variant.price > 0
        ? variant.price
        : typeof product?.price_min === "number" && product.price_min > 0
        ? product.price_min
        : 0;

    const unitPrice = pricingMap.get(row.variant_id) ?? fallbackPrice;

    const defaultPackSize = (() => {
      if (variant?.title && variant.title !== "Default Title") return variant.title;
      const sizeMatch = product?.title?.match(/\b(\d+\s*(?:ml|g|gm|kg|pcs|oz))\b/i);
      if (sizeMatch) return sizeMatch[1];
      if (/cream/i.test(product?.title || "")) return "50g";
      return "100ml";
    })();

    const packSize = packSizeMap.get(row.variant_id) || defaultPackSize;

    return {
      id: row.id,
      variantId: row.variant_id,
      quantity: row.quantity,
      price: unitPrice,
      packSize,
    };
  });

  const initialData: DispatchEditData = {
    dispatchId: dispatch.id,
    recipientName: dispatch.recipient_name,
    dispatchDate: inputDateStr,
    phone: parsedPhone || "",
    address: parsedAddress || "",
    notes: displayNotes,
    paymentStatus,
    packagingType,
    discountType: pricingData?.discount?.type || "percentage",
    discountValue: typeof pricingData?.discount?.value === "number" ? pricingData.discount.value : "",
    items: initialLineItems,
  };

  return (
    <div className="space-y-6">
      <DispatchForm availableItems={availableItems} initialData={initialData} />
    </div>
  );
}
