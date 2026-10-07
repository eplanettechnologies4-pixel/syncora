"use client";

import React, { useState } from "react";
import {
  Boxes,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
} from "lucide-react";

export interface InventoryItemData {
  id: string;
  variant_id: string;
  quantity: number;
  updated_at: string;
  product_variants: {
    id: string;
    shopify_variant_id: number;
    title: string;
    sku: string | null;
    products: {
      id: string;
      title: string;
      image_url: string | null;
    } | null;
  } | null;
}

interface InventoryTableProps {
  initialItems: InventoryItemData[];
}

export default function InventoryTable({ initialItems }: InventoryTableProps) {
  // Map of variant_id -> current saved quantity
  const [currentQuantities, setCurrentQuantities] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    initialItems.forEach((item) => {
      map[item.variant_id] = item.quantity;
    });
    return map;
  });

  // Map of variant_id -> input draft quantity
  const [inputQuantities, setInputQuantities] = useState<Record<string, number | string>>(() => {
    const map: Record<string, number> = {};
    initialItems.forEach((item) => {
      map[item.variant_id] = item.quantity;
    });
    return map;
  });

  // Saving state per variant_id
  const [savingId, setSavingId] = useState<string | null>(null);

  // Status message per variant_id
  const [messages, setMessages] = useState<
    Record<string, { type: "success" | "error"; text: string }>
  >({});

  const handleQuantityChange = (variantId: string, value: string) => {
    setInputQuantities((prev) => ({
      ...prev,
      [variantId]: value,
    }));
  };

  const handleSave = async (variantId: string) => {
    const rawVal = inputQuantities[variantId];
    const newQty = parseInt(String(rawVal), 10);

    if (isNaN(newQty) || newQty < 0) {
      setMessages((prev) => ({
        ...prev,
        [variantId]: { type: "error", text: "Please enter a valid non-negative number" },
      }));
      return;
    }

    setSavingId(variantId);
    setMessages((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });

    try {
      const res = await fetch("/api/update-inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          variantId,
          newQuantity: newQty,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessages((prev) => ({
          ...prev,
          [variantId]: {
            type: "error",
            text: data.error || "Failed to update inventory",
          },
        }));
      } else {
        setCurrentQuantities((prev) => ({
          ...prev,
          [variantId]: newQty,
        }));
        setMessages((prev) => ({
          ...prev,
          [variantId]: {
            type: "success",
            text: "Saved to Shopify & DB",
          },
        }));

        // Automatically clear success toast message after 4 seconds
        setTimeout(() => {
          setMessages((prev) => {
            const next = { ...prev };
            if (next[variantId]?.type === "success") {
              delete next[variantId];
            }
            return next;
          });
        }, 4000);
      }
    } catch (err: any) {
      setMessages((prev) => ({
        ...prev,
        [variantId]: {
          type: "error",
          text: err.message || "Network error occurred",
        },
      }));
    } finally {
      setSavingId(null);
    }
  };

  if (initialItems.length === 0) {
    return (
      <div className="py-14 text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-400">
          <Boxes className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-300">No Inventory Records Found</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Run the inventory sync to fetch available quantities from Shopify.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <th className="py-3 px-6">Product</th>
            <th className="py-3 px-6">Variant</th>
            <th className="py-3 px-6">Current Quantity</th>
            <th className="py-3 px-6">Update Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-200">
          {initialItems.map((item) => {
            const variantId = item.variant_id;
            const variant = item.product_variants;
            const product = variant?.products;
            const currentQty = currentQuantities[variantId] ?? item.quantity;
            const inputVal = inputQuantities[variantId] ?? currentQty;
            const isSaving = savingId === variantId;
            const msg = messages[variantId];

            return (
              <tr
                key={item.id}
                className="hover:bg-slate-800/30 transition-colors duration-100"
              >
                {/* Product Name & Thumbnail */}
                <td className="py-3.5 px-6 font-medium text-white">
                  <div className="flex items-center gap-3">
                    {product?.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title || "Product"}
                        className="w-10 h-10 rounded-lg object-cover border border-slate-800 bg-slate-900 shrink-0 shadow-sm"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-slate-400 shadow-sm">
                        <ImageIcon className="w-4 h-4 text-slate-400 stroke-[1.5]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-white text-sm truncate max-w-xs">
                        {product?.title || "Unknown Product"}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Variant */}
                <td className="py-3.5 px-6 text-slate-300 text-xs">
                  <div className="font-medium text-slate-200">
                    {variant?.title && variant.title !== "Default Title"
                      ? variant.title
                      : "Default Variant"}
                  </div>
                  {variant?.sku && (
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      SKU: {variant.sku}
                    </div>
                  )}
                </td>

                {/* Current Quantity */}
                <td className="py-3.5 px-6 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      currentQty > 5
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : currentQty > 0
                        ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {currentQty} {currentQty === 1 ? "unit" : "units"}
                  </span>
                </td>

                {/* Editable Quantity & Save Button */}
                <td className="py-3.5 px-6">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={inputVal}
                        onChange={(e) => handleQuantityChange(variantId, e.target.value)}
                        disabled={isSaving}
                        className="w-24 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-white text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleSave(variantId)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm hover:shadow-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Inline Success / Error Message */}
                    {msg && (
                      <div
                        className={`flex items-center gap-1.5 text-xs font-medium ${
                          msg.type === "success" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {msg.type === "success" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="leading-tight">{msg.text}</span>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
