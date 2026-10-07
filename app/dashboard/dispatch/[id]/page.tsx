import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PrintButton from "@/components/dispatch/PrintButton";
import DeleteDispatchButton from "@/components/dispatch/DeleteDispatchButton";
import DispatchStatusDropdown from "@/components/dispatch/DispatchStatusDropdown";
import DispatchPrintStatusBadge from "@/components/dispatch/DispatchPrintStatusBadge";
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Pencil,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface ReceiptPageProps {
  params: {
    id: string;
  };
}

export default async function DispatchReceiptPage({ params }: ReceiptPageProps) {
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

  // 2. Fetch dispatch items
  const { data: items, error: itemsErr } = await supabaseServer
    .from("manual_dispatch_items")
    .select(
      `
      id,
      quantity,
      quantity_before,
      quantity_after,
      variant_id,
      product_variants (
        id,
        shopify_variant_id,
        title,
        sku,
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
    console.error("Error fetching dispatch items:", itemsErr);
  }

  // Format date like: 24-Sep-26
  const formatChallanDate = (dateStr: string) => {
    if (!dateStr) return "";
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mIdx = parseInt(month, 10) - 1;
      const mName = monthNames[mIdx] || month;
      const y2 = year.slice(-2);
      return `${day.padStart(2, "0")}-${mName}-${y2}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "short" });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  };

  // Parse optional pricing, discount, and paymentStatus metadata from notes
  let displayNotes = dispatch.notes || "";
  let paymentStatus: "paid" | "unpaid" = "unpaid";
  let paidAt: string | null = null;
  let isPrinted = false;
  let printedAt: string | null = null;
  let parsedAddress: string | null = null;
  let parsedPhone: string | null = null;
  let parsedDispatchDate: string | null = null;
  let packagingType = "TUBES";
  let pricingData: {
    subtotal?: number;
    discount?: { type: "percentage" | "fixed"; value: number; amount: number };
    totalAmount?: number;
    items?: Array<{ variantId: string; quantity: number; unitPrice: number; totalPrice: number }>;
  } | null = null;

  if (dispatch.notes && typeof dispatch.notes === "string" && dispatch.notes.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(dispatch.notes);
      if (parsed && typeof parsed === "object") {
        displayNotes = parsed.text || "";
        paymentStatus = parsed.paymentStatus === "paid" ? "paid" : "unpaid";
        paidAt = parsed.paidAt || null;
        isPrinted = parsed.isPrinted === true;
        printedAt = parsed.printedAt || null;
        pricingData = parsed.pricing || null;
        if (typeof parsed.packagingType === "string" && parsed.packagingType.trim()) {
          packagingType = parsed.packagingType.trim().toUpperCase();
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

  const challanDate = formatChallanDate(parsedDispatchDate || dispatch.created_at);

  const pricingMap = new Map<string, { unitPrice: number; totalPrice: number }>();
  const packSizeMap = new Map<string, string>();
  if (pricingData?.items) {
    pricingData.items.forEach((pItem: any) => {
      pricingMap.set(pItem.variantId, {
        unitPrice: pItem.unitPrice,
        totalPrice: pItem.totalPrice,
      });
      if (typeof pItem.packSize === "string" && pItem.packSize.trim()) {
        packSizeMap.set(pItem.variantId, pItem.packSize.trim());
      }
    });
  }

  // Calculate totals and pack sizes
  const processedItems = (items || []).map((row: any, idx: number) => {
    const variant = row.product_variants;
    const product = variant?.products;
    const productTitle = product?.title || "Product";

    // Extract pack size (manual user selection if available, otherwise variant title/product size pattern)
    const customPackSize = packSizeMap.get(row.variant_id);
    let packSize = customPackSize || "100ml";
    if (!customPackSize) {
      if (variant?.title && variant.title !== "Default Title") {
        packSize = variant.title;
      } else {
        const sizeMatch = productTitle.match(/\b(\d+\s*(?:ml|g|gm|kg|pcs|oz))\b/i);
        if (sizeMatch) {
          packSize = sizeMatch[1];
        }
      }
    }

    const fallbackPrice =
      typeof variant?.price === "number" && variant.price > 0
        ? variant.price
        : typeof product?.price_min === "number" && product.price_min > 0
          ? product.price_min
          : 0;

    const pricingItem = pricingMap.get(row.variant_id);
    const unitPrice = pricingItem?.unitPrice ?? fallbackPrice;
    const lineTotal = pricingItem?.totalPrice ?? unitPrice * row.quantity;

    return {
      sr: idx + 1,
      id: row.id,
      description: productTitle,
      packSize,
      quantity: row.quantity,
      unitPrice,
      lineTotal,
    };
  });

  const totalCalculatedUnits = processedItems.reduce((acc, item) => acc + item.quantity, 0);
  const subtotalAmount =
    pricingData?.subtotal ?? processedItems.reduce((acc, item) => acc + item.lineTotal, 0);
  const discountAmount = pricingData?.discount?.amount ?? 0;
  const netTotalAmount = pricingData?.totalAmount ?? Math.max(0, subtotalAmount - discountAmount);

  // Parse party address, phone, and DC / Order numbers
  let dcNo = dispatch.id.slice(0, 4).toUpperCase();
  let orderNo = dispatch.id.slice(0, 4).toUpperCase();
  let partyAddress = parsedAddress
    ? parsedAddress
    : displayNotes && !/^\d+$/.test(displayNotes.trim())
      ? displayNotes.trim()
      : "";
  let partyPhone = parsedPhone ? parsedPhone : "";

  if (displayNotes && !parsedAddress) {
    const cleanNotes = displayNotes.trim();
    if (/^\d+$/.test(cleanNotes)) {
      dcNo = cleanNotes.padStart(4, "0");
      orderNo = cleanNotes.padStart(4, "0");
    }
  }

  return (
    <>
      {/* Zero margin print style to eliminate browser default URL and date footers/headers */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page {
              size: A4 portrait;
              margin: 0mm !important;
            }
            @media print {
              html, body {
                margin: 0mm !important;
                padding: 0mm !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .challan-page {
                page-break-after: avoid !important;
                page-break-before: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `,
        }}
      />

      <div className="min-h-screen bg-[#090d16] text-slate-100 p-4 sm:p-8 font-sans print:p-0 print:m-0 print:min-h-0 print:bg-white print:text-black">
        {/* Top Navigation Bar - Hidden on Print */}
        <div className="max-w-3xl mx-auto mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/dispatch"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-all shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              New Dispatch
            </Link>
            <Link
              href="/dashboard/dispatch/history"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-all shadow-sm"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              History Log
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <DispatchStatusDropdown
                dispatchId={dispatch.id}
                initialStatus={paymentStatus}
              />
              <DispatchPrintStatusBadge
                dispatchId={dispatch.id}
                initialIsPrinted={isPrinted}
                initialPrintedAt={printedAt}
              />
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
              Shopify Synced
            </div>
            <Link
              href={`/dashboard/dispatch/${dispatch.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/40 text-xs font-semibold transition-all shadow-sm active:scale-95"
              title="Edit this dispatch receipt"
            >
              <Pencil className="w-3.5 h-3.5 stroke-[2]" />
              <span>Edit Receipt</span>
            </Link>
            <DeleteDispatchButton
              dispatchId={dispatch.id}
              recipientName={dispatch.recipient_name}
              redirectOnDelete="/dashboard/dispatch/history"
              variant="header"
            />
            <PrintButton dispatchId={dispatch.id} initialIsPrinted={isPrinted} />
          </div>
        </div>

        {/* Main Printable Delivery Challan Card - Exactly matching the Reference Design */}
        <div className="max-w-3xl mx-auto bg-white text-stone-900 shadow-2xl rounded-sm overflow-hidden print:border-none print:shadow-none print:bg-white print:m-0 print:max-w-none print:w-full print:rounded-none challan-page print:max-h-[285mm] print:overflow-hidden">
          <div className="p-8 sm:p-12 print:p-8 text-stone-900 space-y-6">

            {/* 1. Header: Alaya Glow & Delivery Challan */}
            <div className="text-center space-y-1">
              <h1 className="text-3xl sm:text-4xl font-bold font-serif text-stone-900 tracking-tight">
                Alaya Glow
              </h1>
              <p className="text-xs text-stone-600">
                G3 The Business Center Regency Road Faisalabad
              </p>
              <p className="text-xs text-stone-600">
                www.alayaglow.com.pk
              </p>
              <div className="pt-2">
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-stone-900 border-b-2 border-stone-800 pb-0.5 inline-block font-sans">
                  DELIVERY CHALLAN
                </span>
              </div>
            </div>

            {/* 2. Party Name & Order Info Grid */}
            <div className="border border-stone-300 text-xs">
              <div className="grid grid-cols-12 divide-x divide-stone-300 border-b border-stone-300">
                {/* Left: Party Name */}
                <div className="col-span-3 sm:col-span-2 py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-stone-700 bg-stone-50/50">
                  PARTY NAME
                </div>
                <div className="col-span-9 sm:col-span-5 py-2 px-3 font-medium text-stone-900">
                  {dispatch.recipient_name}
                </div>
                {/* Right: D.C No. */}
                <div className="col-span-4 sm:col-span-2 py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-stone-700 bg-stone-50/50">
                  D.C NO.
                </div>
                <div className="col-span-8 sm:col-span-3 py-2 px-3 font-medium text-stone-900">
                  {dcNo}
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-stone-300 border-b border-stone-300">
                {/* Left: Address */}
                <div className="col-span-3 sm:col-span-2 py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-stone-700 bg-stone-50/50">
                  ADDRESS
                </div>
                <div className="col-span-9 sm:col-span-5 py-2 px-3 text-stone-800">
                  {partyAddress}
                </div>
                {/* Right: Order No. */}
                <div className="col-span-4 sm:col-span-2 py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-stone-700 bg-stone-50/50">
                  ORDER NO.
                </div>
                <div className="col-span-8 sm:col-span-3 py-2 px-3 font-medium text-stone-900">
                  {orderNo}
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-stone-300">
                {/* Left: Phone No. */}
                <div className="col-span-3 sm:col-span-2 py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-stone-700 bg-stone-50/50">
                  PHONE NO.
                </div>
                <div className="col-span-9 sm:col-span-5 py-2 px-3 text-stone-800">
                  {partyPhone}
                </div>
                {/* Right: Date */}
                <div className="col-span-4 sm:col-span-2 py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-stone-700 bg-stone-50/50">
                  DATE
                </div>
                <div className="col-span-8 sm:col-span-3 py-2 px-3 font-medium text-stone-900">
                  {challanDate}
                </div>
              </div>
            </div>

            {/* 3. Goods Table */}
            <div className="border border-stone-300 overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-300 text-[10px] font-bold uppercase tracking-wider text-stone-700 bg-stone-50/50 divide-x divide-stone-300">
                    <th className="py-2.5 px-2 w-12 text-center">SR#</th>
                    <th className="py-2.5 px-3">DESCRIPTION OF GOODS</th>
                    <th className="py-2.5 px-3 w-24 text-center">PACK SIZE</th>
                    <th className="py-2.5 px-3 w-20 text-center">QUANTITY</th>
                    <th className="py-2.5 px-3 w-24 text-center">UNIT PRICE</th>
                    <th className="py-2.5 px-3 w-24 text-center">TOTAL</th>
                    <th className="w-6 py-2.5 px-1 border-l border-stone-300 print:hidden" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-300 text-stone-800">
                  {processedItems.map((item) => (
                    <tr key={item.id} className="divide-x divide-stone-300">
                      <td className="py-2 px-2 text-center text-stone-600">
                        {item.sr}
                      </td>
                      <td className="py-2 px-3 font-normal text-stone-900">
                        {item.description}
                      </td>
                      <td className="py-2 px-3 text-center text-stone-700">
                        {item.packSize}
                      </td>
                      <td className="py-2 px-3 text-center text-stone-900">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-3 text-center text-stone-900">
                        {item.unitPrice.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-stone-900">
                        {item.lineTotal.toLocaleString()}
                      </td>
                      <td className="w-6 py-2 px-1 border-l border-stone-300 print:hidden" />
                    </tr>
                  ))}

                  {/* Summary Row */}
                  <tr className="border-t border-stone-300 divide-x divide-stone-300 font-bold text-stone-900 bg-stone-50/30">
                    <td className="py-2 px-2" />
                    <td className="py-2 px-3 text-right uppercase tracking-wider text-[11px] text-stone-800">
                      TOTAL
                    </td>
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-center font-bold text-stone-900">
                      {totalCalculatedUnits}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-stone-800 uppercase text-[10px] tracking-wider">
                      {packagingType}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-stone-900">
                      {subtotalAmount.toLocaleString()}
                    </td>
                    <td className="w-6 py-2 px-1 border-l border-stone-300 print:hidden" />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. Subtotal & Calculation Box (Aligned to the Right) */}
            <div className="flex justify-end pt-1">
              <div className="w-72 border border-stone-300 divide-y divide-stone-300 text-xs">
                <div className="flex justify-between py-1.5 px-3">
                  <span className="text-stone-700 font-normal">Subtotal</span>
                  <span className="text-stone-900 font-medium">{subtotalAmount.toLocaleString()}</span>
                </div>

                {pricingData?.discount && pricingData.discount.amount > 0 ? (
                  <>
                    <div className="flex justify-between py-1.5 px-3">
                      <span className="text-stone-700 font-normal">Discount</span>
                      <span className="text-stone-900 font-medium">
                        {pricingData.discount.type === "percentage" ? `${pricingData.discount.value} %` : "Fixed"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 px-3">
                      <span className="text-stone-700 font-normal">Discount amount</span>
                      <span className="text-stone-900 font-medium">{discountAmount.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between py-1.5 px-3">
                      <span className="text-stone-700 font-normal">Discount</span>
                      <span className="text-stone-900 font-medium">0 %</span>
                    </div>
                    <div className="flex justify-between py-1.5 px-3">
                      <span className="text-stone-700 font-normal">Discount amount</span>
                      <span className="text-stone-900 font-medium">0</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between py-2 px-3 font-bold text-stone-900 text-sm bg-stone-50/50">
                  <span>Net total</span>
                  <span>{netTotalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* 5. Signature Lines (Manager and Verify by) */}
            <div className="pt-14 sm:pt-20 grid grid-cols-2 gap-8 text-xs text-stone-800">
              <div className="space-y-1">
                <div className="border-b border-stone-800 w-48 sm:w-60 mb-2" />
                <p className="font-bold text-stone-900">Manager</p>
                <p className="text-[11px] text-stone-600">Date: {challanDate}</p>
              </div>

              <div className="space-y-1">
                <div className="border-b border-stone-800 w-48 sm:w-60 mb-2" />
                <p className="font-bold text-stone-900">Verify by</p>
                <p className="text-[11px] text-stone-600">Date: {challanDate}</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}


