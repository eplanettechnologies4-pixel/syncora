"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  Plus,
  Trash2,
  AlertCircle,
  Package,
  Layers,
  ArrowLeft,
  CheckCircle2,
  FileText,
  History,
  Check,
  Search,
  ChevronDown,
  X,
  Minus,
  Boxes,
  Tag,
  Percent,
  Coins,
  RotateCcw,
  Clock,
  CreditCard,
  User,
  Hash,
  Phone,
  MapPin,
  Calendar,
  Pencil,
} from "lucide-react";

export interface DispatchableItem {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  stock: number;
  price: number;
  imageUrl: string | null;
}

export const COMMON_PACK_SIZES = [
  "100ml",
  "50ml",
  "150ml",
  "200ml",
  "250ml",
  "75ml",
  "30ml",
  "30g",
  "50g",
  "100g",
  "Jar",
  "Tube",
  "Bundle",
];

export interface DispatchEditItem {
  id: string;
  variantId: string;
  quantity: number;
  price: number;
  packSize?: string;
}

export interface DispatchEditData {
  dispatchId: string;
  recipientName: string;
  dispatchDate: string;
  phone: string;
  address: string;
  notes: string;
  paymentStatus: "unpaid" | "paid";
  packagingType?: "TUBES" | "JAR" | "TUBE + JAR";
  discountType: "percentage" | "fixed";
  discountValue: number | "";
  items: DispatchEditItem[];
}

interface DispatchFormProps {
  availableItems: DispatchableItem[];
  initialData?: DispatchEditData;
}

interface LineItemState {
  id: string; // internal unique key for form row
  variantId: string;
  quantity: number;
  price: number; // custom unit price for this manual dispatch
  packSize: string; // custom pack size, e.g. "100ml", "50ml", "Jar", etc.
}

const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export default function DispatchForm({ availableItems, initialData }: DispatchFormProps) {
  const router = useRouter();
  const isEditMode = Boolean(initialData?.dispatchId);

  // Helper to format today's local date as YYYY-MM-DD
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Map for fast lookup
  const itemsMap = useMemo(() => {
    const map = new Map<string, DispatchableItem>();
    availableItems.forEach((item) => map.set(item.variantId, item));
    return map;
  }, [availableItems]);

  // Default pack size helper based on product title / variant title
  const getDefaultPackSize = (variantId: string): string => {
    const prod = itemsMap.get(variantId);
    if (!prod) return "100ml";
    if (prod.variantTitle && prod.variantTitle !== "Default Title") {
      return prod.variantTitle;
    }
    const match = prod.productTitle.match(/\b(\d+\s*(?:ml|g|gm|kg|pcs|oz))\b/i);
    if (match) return match[1];
    if (/cream/i.test(prod.productTitle)) return "50g";
    return "100ml";
  };

  // Step 1: Consignee & Payment Details
  const [recipientName, setRecipientName] = useState(initialData?.recipientName || "");
  const [dispatchDate, setDispatchDate] = useState<string>(() => initialData?.dispatchDate || getTodayDateString());
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [address, setAddress] = useState(initialData?.address || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "paid">(initialData?.paymentStatus || "unpaid");
  const [packagingType, setPackagingType] = useState<"TUBES" | "JAR" | "TUBE + JAR">(
    initialData?.packagingType || "TUBES"
  );

  // Step 2 & 3: Items & Pricing
  const [items, setItems] = useState<LineItemState[]>(() => {
    if (initialData?.items && initialData.items.length > 0) {
      return initialData.items.map((it) => ({
        ...it,
        packSize: it.packSize || "100ml",
      }));
    }
    const firstInStock = availableItems.find((it) => it.stock > 0);
    if (firstInStock) {
      return [
        {
          id: generateId(),
          variantId: firstInStock.variantId,
          quantity: 1,
          price: firstInStock.price || 0,
          packSize: "100ml",
        },
      ];
    }
    return [];
  });

  // Step 4: Discount & Valuation
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(initialData?.discountType || "percentage");
  const [discountValue, setDiscountValue] = useState<number | "">(initialData?.discountValue ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Multi-select dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [batchQty, setBatchQty] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Set of selected variant IDs
  const selectedVariantIds = useMemo(() => {
    return new Set(items.map((it) => it.variantId));
  }, [items]);

  // Filtered available items based on search query
  const filteredAvailableItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    const q = searchQuery.toLowerCase().trim();
    return availableItems.filter((item) => {
      const matchProduct = item.productTitle.toLowerCase().includes(q);
      const matchVariant = item.variantTitle.toLowerCase().includes(q);
      const matchSku = item.sku ? item.sku.toLowerCase().includes(q) : false;
      return matchProduct || matchVariant || matchSku;
    });
  }, [availableItems, searchQuery]);

  // Running quantity totals
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  const uniqueItemCount = useMemo(() => {
    const validIds = items.filter((it) => it.variantId).map((it) => it.variantId);
    return new Set(validIds).size;
  }, [items]);

  // Financial calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => {
      const qty = Number(it.quantity) || 0;
      const unitPrice = Number(it.price) || 0;
      return sum + qty * unitPrice;
    }, 0);
  }, [items]);

  const discountAmount = useMemo(() => {
    const val = Number(discountValue) || 0;
    if (val <= 0 || subtotal <= 0) return 0;
    if (discountType === "percentage") {
      const cappedPercent = Math.min(100, Math.max(0, val));
      return Math.round((subtotal * cappedPercent) / 100);
    } else {
      return Math.min(subtotal, Math.max(0, val));
    }
  }, [discountType, discountValue, subtotal]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  // Check if any line item exceeds stock
  const hasExceededStock = useMemo(() => {
    return items.some((item) => {
      const stockInfo = itemsMap.get(item.variantId);
      const maxStock = stockInfo ? stockInfo.stock : 0;
      return item.quantity > maxStock;
    });
  }, [items, itemsMap]);

  // In-stock filtered items for selectable count
  const inStockFilteredItems = useMemo(() => {
    return filteredAvailableItems.filter((it) => it.stock > 0);
  }, [filteredAvailableItems]);

  // Toggle variant selection (add if not present, remove if present)
  const toggleVariantSelection = (variantId: string) => {
    const prod = itemsMap.get(variantId);
    if (prod && prod.stock <= 0) return; // Out of stock items cannot be selected
    setItems((prev) => {
      const existing = prev.some((it) => it.variantId === variantId);
      if (existing) {
        return prev.filter((it) => it.variantId !== variantId);
      } else {
        return [
          ...prev,
          {
            id: generateId(),
            variantId,
            quantity: 1,
            price: prod?.price || 0,
            packSize: getDefaultPackSize(variantId),
          },
        ];
      }
    });
  };

  // Select all in-stock items currently filtered in the search list
  const handleSelectAllFiltered = () => {
    setItems((prev) => {
      const currentVariantMap = new Map(prev.map((it) => [it.variantId, it]));
      const updated = [...prev];
      for (const prod of inStockFilteredItems) {
        if (!currentVariantMap.has(prod.variantId)) {
          updated.push({
            id: generateId(),
            variantId: prod.variantId,
            quantity: 1,
            price: prod.price || 0,
            packSize: getDefaultPackSize(prod.variantId),
          });
        }
      }
      return updated;
    });
  };

  // Deselect all items
  const handleDeselectAll = () => {
    setItems([]);
  };

  // Remove single line item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Update line item custom pack size
  const handleUpdatePackSize = (id: string, packSize: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, packSize } : it))
    );
  };

  // Update line item quantity
  const handleUpdateQuantity = (id: string, value: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const qty = parseInt(value, 10);
        return { ...it, quantity: isNaN(qty) ? 0 : Math.max(0, qty) };
      })
    );
  };

  // Update line item custom unit price
  const handleUpdatePrice = (id: string, value: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const price = parseFloat(value);
        return { ...it, price: isNaN(price) ? 0 : Math.max(0, price) };
      })
    );
  };

  // Reset price to default variant price
  const handleResetPrice = (id: string, variantId: string) => {
    const defaultPrice = itemsMap.get(variantId)?.price || 0;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        return { ...it, price: defaultPrice };
      })
    );
  };

  // Adjust quantity by delta (+1 or -1)
  const handleAdjustQuantity = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const stockInfo = itemsMap.get(it.variantId);
        const maxStock = stockInfo ? stockInfo.stock : 99999;
        const newQty = Math.max(1, Math.min(maxStock, (it.quantity || 0) + delta));
        return { ...it, quantity: newQty };
      })
    );
  };

  // Set quantity to maximum available stock
  const handleSetMaxStock = (id: string, variantId: string) => {
    const stockInfo = itemsMap.get(variantId);
    if (!stockInfo) return;
    handleUpdateQuantity(id, stockInfo.stock);
  };

  // Apply batch quantity to all selected items
  const handleApplyBatchQty = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(batchQty, 10);
    if (isNaN(qty) || qty <= 0) return;
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        quantity: qty,
      }))
    );
    setBatchQty("");
  };

  // Submit dispatch
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!recipientName.trim()) {
      setErrorMessage("Please enter a recipient or consignee name.");
      return;
    }

    if (items.length === 0) {
      setErrorMessage("Please select at least one product to dispatch.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.variantId) {
        setErrorMessage(`Line item #${i + 1} has no product selected.`);
        return;
      }
      if (!item.quantity || item.quantity <= 0) {
        setErrorMessage(`Line item #${i + 1} must have a quantity of at least 1.`);
        return;
      }
      const stockInfo = itemsMap.get(item.variantId);
      if (stockInfo && item.quantity > stockInfo.stock) {
        setErrorMessage(
          `Line item #${i + 1} (${stockInfo.productTitle}): requested quantity (${item.quantity}) exceeds available stock (${stockInfo.stock}).`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        dispatchId: initialData?.dispatchId,
        recipientName: recipientName.trim(),
        dispatchDate: dispatchDate.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentStatus,
        packagingType,
        discount: {
          type: discountType,
          value: Number(discountValue) || 0,
          amount: discountAmount,
        },
        subtotal,
        totalAmount,
        items: items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: it.price,
          totalPrice: it.quantity * it.price,
          packSize: it.packSize || "100ml",
        })),
      };

      const res = await fetch("/api/dispatch", {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !(data.ok ?? data.success)) {
        throw new Error(data.error || `Failed to ${isEditMode ? "update" : "create"} dispatch`);
      }

      // Redirect directly to the generated or updated receipt
      const targetDispatchId = isEditMode ? initialData!.dispatchId : data.dispatchId;
      router.push(`/dashboard/dispatch/${targetDispatchId}`);
      router.refresh();
    } catch (err: any) {
      console.error("Submission error:", err);
      setErrorMessage(err.message || "An unexpected error occurred while processing dispatch.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Banner & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
            <Link
              href="/dashboard?tab=inventory"
              className="hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Inventory
            </Link>
            <span>/</span>
            <Link
              href="/dashboard/dispatch/history"
              className="hover:text-emerald-400 transition-colors"
            >
              Dispatch History
            </Link>
            {isEditMode && initialData ? (
              <>
                <span>/</span>
                <Link
                  href={`/dashboard/dispatch/${initialData.dispatchId}`}
                  className="hover:text-amber-400 transition-colors font-mono"
                >
                  Receipt #{initialData.dispatchId.slice(0, 8)}
                </Link>
                <span>/</span>
                <span className="text-amber-400 font-semibold">Edit Receipt</span>
              </>
            ) : (
              <>
                <span>/</span>
                <span className="text-slate-200">Stock Dispatch</span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-950 shadow-lg ${
                isEditMode
                  ? "bg-gradient-to-tr from-amber-500 to-orange-400 shadow-amber-500/20"
                  : "bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-emerald-500/20"
              }`}
            >
              {isEditMode ? (
                <Pencil className="w-5 h-5 stroke-[2.3]" />
              ) : (
                <Truck className="w-5 h-5 stroke-[2.3]" />
              )}
            </div>
            {isEditMode ? "Edit Stock Dispatch Receipt" : "Manual Stock Dispatch"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {isEditMode
              ? "Modify party info, date, line items, quantities, or pricing. Warehouse stock and Shopify inventory will adjust automatically."
              : "Deduct offline distributor and wholesale shipments from Supabase warehouse inventory and push updates to Shopify."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isEditMode && initialData && (
            <Link
              href={`/dashboard/dispatch/${initialData.dispatchId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-all shadow-sm shrink-0"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              View Receipt
            </Link>
          )}
          <Link
            href="/dashboard/dispatch/history"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-all shadow-sm shrink-0"
          >
            <History className="w-4 h-4 text-emerald-400" />
            Dispatch History
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm flex items-start gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to process dispatch</p>
            <p className="text-xs text-rose-300/90 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 01: CONSIGNEE & SHIPMENT DETAILS */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-sm p-6 shadow-xl space-y-6" >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold flex items-center justify-center">
              01
            </span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Consignee &amp; Payment Terms
              </h2>
              <p className="text-xs text-slate-400">
                Specify recipient info and the initial payment state for this receipt.
              </p>
            </div>
          </div>

          {/* Payment Status Pill */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${paymentStatus === "paid"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}
            >
              {paymentStatus === "paid" ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Paid In Full
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5" /> Unpaid / Pending
                </>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recipient Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              Party / Recipient Name <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Bilal / Lahore Central Distributor"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-medium"
            />
          </div>

          {/* Dispatch Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Dispatch Date <span className="text-emerald-400">*</span>
            </label>
            <input
              type="date"
              required
              value={dispatchDate}
              onChange={(e) => setDispatchDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all [color-scheme:dark] font-medium"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              Phone / Contact Number
            </label>
            <input
              type="text"
              placeholder="e.g. 0300-1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono"
            />
          </div>

          {/* Delivery Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Delivery / Party Address
            </label>
            <input
              type="text"
              placeholder="e.g. Shop #4, Main Market, Faisalabad"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Initial Payment Status Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                Initial Payment Status
              </span>
              <span className="text-[11px] text-slate-400">Default is Unpaid</span>
            </label>

            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setPaymentStatus("unpaid")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${paymentStatus === "unpaid"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Unpaid / Pending
              </button>

              <button
                type="button"
                onClick={() => setPaymentStatus("paid")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${paymentStatus === "paid"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Paid In Full
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              You can easily manage this status anytime from Dispatch History.
            </p>
          </div>

          {/* Shipment Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              Shipment Remarks &amp; Reference Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Invoice #1008, dispatch via Cargo, delivery receipt confirmation"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all resize-none"
            />
          </div>

          {/* Challan Packaging / Unit Label Dropdown */}
          <div className="md:col-span-2 p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Package className="w-4 h-4 text-emerald-400" />
                Challan Packaging / Unit Label <span className="text-emerald-400">*</span>
              </label>
              <p className="text-xs text-slate-400 max-w-lg">
                Select which unit label prints in the receipt total row:{" "}
                <span className="text-emerald-300 font-mono font-bold">TUBES</span>,{" "}
                <span className="text-emerald-300 font-mono font-bold">JAR</span>, or{" "}
                <span className="text-emerald-300 font-mono font-bold">TUBE + JAR</span>.
              </p>
            </div>

            <div className="relative shrink-0 w-full sm:w-56">
              <select
                value={packagingType}
                onChange={(e) =>
                  setPackagingType(e.target.value as "TUBES" | "JAR" | "TUBE + JAR")
                }
                className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
              >
                <option value="TUBES" className="bg-slate-900 text-white py-1">
                  TUBES
                </option>
                <option value="JAR" className="bg-slate-900 text-white py-1">
                  JAR
                </option>
                <option value="TUBE + JAR" className="bg-slate-900 text-white py-1">
                  TUBE + JAR
                </option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 02: SELECT PRODUCTS TO DISPATCH */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-sm p-6 shadow-xl space-y-6" style={{ position: "relative", zIndex: 999999 }}>
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold flex items-center justify-center">
              02
            </span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Product Catalog Selection
              </h2>
              <p className="text-xs text-slate-400">
                Check one or multiple products to include in this dispatch shipment.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-medium">
              {items.length} of {availableItems.length} selected
            </span>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-emerald-400 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {isDropdownOpen ? "Close List" : "Browse Products"}
            </button>
          </div>
        </div>

        {/* MULTI-SELECT DROPDOWN CONTAINER */}
        <div ref={dropdownRef} className="relative">
          <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-2">
              Select Product(s) / Variant(s)
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Multi-Select
              </span>
            </span>
            <span className="text-[11px] text-slate-400">
              Click to open catalog &amp; check multiple items
            </span>
          </label>

          {/* Trigger button */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className={`w-full px-4 py-3 rounded-xl bg-slate-900 border text-left flex items-center justify-between transition-all group ${isDropdownOpen
              ? "border-emerald-500 ring-2 ring-emerald-500/30"
              : "border-slate-700/80 hover:border-slate-600"
              }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
              <Boxes className="w-4 h-4 text-emerald-400 shrink-0" />
              {items.length === 0 ? (
                <span className="text-slate-400 text-sm">
                  Click here to browse and select products to dispatch...
                </span>
              ) : (
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-white text-sm font-semibold">
                    {items.length} {items.length === 1 ? "product" : "products"} selected:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {items.slice(0, 3).map((it) => {
                      const productInfo = itemsMap.get(it.variantId);
                      if (!productInfo) return null;
                      return (
                        <span
                          key={it.id}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium truncate max-w-[220px]"
                        >
                          {productInfo.productTitle}
                        </span>
                      );
                    })}
                    {items.length > 3 && (
                      <span className="text-xs text-slate-400 font-mono font-medium">
                        +{items.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? "rotate-180 text-emerald-400" : ""
                  }`}
              />
            </div>
          </button>

          {/* DROPDOWN POPOVER */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 z-40 rounded-2xl border border-slate-700 bg-[#0c1220] shadow-2xl overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Search Bar & Quick Actions Header */}
              <div className="p-3 border-b border-slate-800 bg-slate-900/80 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by product name or SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs pt-1 px-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                    >
                      Select All ({inStockFilteredItems.length})
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-slate-400 hover:text-rose-400 font-medium transition-colors"
                    >
                      Clear Selection
                    </button>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">
                    Showing {filteredAvailableItems.length} products
                  </span>
                </div>
              </div>

              {/* Scrollable Products List with Checkboxes */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 p-2">
                {filteredAvailableItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No products matched your search "{searchQuery}"
                  </div>
                ) : (
                  filteredAvailableItems.map((prod) => {
                    const isSelected = selectedVariantIds.has(prod.variantId);
                    const isOutOfStock = prod.stock <= 0;

                    return (
                      <div
                        key={prod.variantId}
                        onClick={() => {
                          if (!isOutOfStock) {
                            toggleVariantSelection(prod.variantId);
                          }
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                          isOutOfStock
                            ? "opacity-50 cursor-not-allowed bg-slate-900/40 text-slate-500 border border-slate-800/40"
                            : isSelected
                            ? "bg-emerald-500/10 border border-emerald-500/30 text-white cursor-pointer"
                            : "hover:bg-slate-800/60 border border-transparent text-slate-300 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                          {/* Checkbox */}
                          <div
                            className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                              isOutOfStock
                                ? "border-slate-700 bg-slate-900/50 text-slate-600"
                                : isSelected
                                ? "bg-emerald-500 border-emerald-500 text-slate-950 font-bold"
                                : "border-slate-600 bg-slate-900 group-hover:border-slate-500"
                            }`}
                          >
                            {isSelected && !isOutOfStock && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {prod.productTitle}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              {prod.variantTitle && prod.variantTitle !== "Default Title" && (
                                <span>{prod.variantTitle}</span>
                              )}
                              {prod.sku && (
                                <span className="font-mono text-[11px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400">
                                  SKU: {prod.sku}
                                </span>
                              )}
                              <span className="font-mono text-emerald-400/90 text-xs">
                                • Price: Rs {prod.price.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stock Badge */}
                        <div className="shrink-0 text-right">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold ${
                              isOutOfStock
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-800 text-emerald-400 border border-slate-700/80"
                            }`}
                          >
                            {isOutOfStock ? "Out of stock" : `${prod.stock} available`}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Popover Footer */}
              <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {items.length} {items.length === 1 ? "product" : "products"} selected
                </span>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-sm"
                >
                  Done Selecting
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 03: LINE ITEMS, QUANTITIES & EDITABLE PRICING */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-sm p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold flex items-center justify-center">
              03
            </span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Line Items, Quantities &amp; Unit Pricing
              </h2>
              <p className="text-xs text-slate-400">
                Adjust quantities and customize unit prices specifically for this dispatch shipment.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono font-medium">
              Total Units: <strong className="text-emerald-400">{totalQuantity}</strong>
            </span>
          </div>
        </div>

        {/* BATCH QUANTITY HELPER TOOLBAR (When multiple items selected) */}
        {items.length > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs text-slate-300 flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Quick Batch Tool: Set same quantity for all selected products
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                placeholder="Qty (e.g. 10)"
                value={batchQty}
                onChange={(e) => setBatchQty(e.target.value)}
                className="w-28 px-2.5 py-1 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleApplyBatchQty}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 border border-slate-700 transition-colors"
              >
                Apply to All
              </button>
            </div>
          </div>
        )}

        {/* SELECTED LINE ITEMS LIST */}
        {items.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">No products selected yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Use Step 02 above to select products from your warehouse inventory.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-md"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Select Products Now
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((lineItem, index) => {
              const currentStockInfo = itemsMap.get(lineItem.variantId);
              const maxStock = currentStockInfo ? currentStockInfo.stock : 0;
              const defaultPrice = currentStockInfo?.price || 0;
              const isExceeded = lineItem.quantity > maxStock;
              const productTitle = currentStockInfo?.productTitle || "Selected Product";
              const variantTitle = currentStockInfo?.variantTitle;
              const sku = currentStockInfo?.sku;
              const isPriceCustomized = lineItem.price !== defaultPrice;
              const lineTotal = (lineItem.quantity || 0) * (lineItem.price || 0);

              return (
                <div
                  key={lineItem.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${isExceeded
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700/80"
                    } flex flex-col xl:flex-row xl:items-center gap-3.5`}
                >
                  {/* Row Index */}
                  <div className="flex items-center gap-3 shrink-0 text-xs font-mono text-slate-500">
                    <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 font-semibold">
                      {index + 1}
                    </span>
                  </div>

                  {/* Product Details Display - Full title without truncate */}
                  <div className="flex-1 min-w-[200px] lg:min-w-[240px]">
                    <h4 className="text-sm font-semibold text-white leading-snug break-words">
                      {productTitle}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                      {variantTitle && variantTitle !== "Default Title" && (
                        <span className="text-slate-300 font-medium">{variantTitle}</span>
                      )}
                      {sku && (
                        <span className="font-mono text-[11px] bg-slate-800/90 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700/50">
                          SKU: {sku}
                        </span>
                      )}
                      <span className="font-mono text-slate-400 text-xs">
                        Default: Rs {defaultPrice.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Available Stock Indicator */}
                  <div className="w-full sm:w-28 shrink-0">
                    <div className="h-5 flex items-center justify-center mb-1">
                      <span className="text-[11px] font-medium text-slate-400">
                        Current Stock
                      </span>
                    </div>
                    <div
                      className={`h-9 px-2.5 rounded-lg text-xs font-semibold font-mono border flex items-center justify-center ${maxStock > 0
                        ? "bg-slate-800/80 text-emerald-400 border-slate-700/60"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        }`}
                    >
                      {maxStock.toLocaleString()} in stock
                    </div>
                  </div>

                  {/* MANUAL PACK SIZE SELECTOR */}
                  <div className="w-full sm:w-32 shrink-0">
                    <div className="h-5 flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-300">
                        Pack Size
                      </label>
                      {!COMMON_PACK_SIZES.includes(lineItem.packSize) && (
                        <span className="text-[10px] text-amber-400 font-mono">Custom</span>
                      )}
                    </div>
                    {COMMON_PACK_SIZES.includes(lineItem.packSize) || !lineItem.packSize ? (
                      <select
                        value={lineItem.packSize || "100ml"}
                        onChange={(e) => {
                          if (e.target.value === "__CUSTOM__") {
                            handleUpdatePackSize(lineItem.id, "");
                          } else {
                            handleUpdatePackSize(lineItem.id, e.target.value);
                          }
                        }}
                        className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all cursor-pointer font-medium"
                      >
                        {COMMON_PACK_SIZES.map((size) => (
                          <option key={size} value={size} className="bg-slate-900 text-white">
                            {size}
                          </option>
                        ))}
                        <option value="__CUSTOM__" className="bg-slate-900 text-emerald-400 font-semibold">
                          + Custom...
                        </option>
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          autoFocus
                          value={lineItem.packSize}
                          onChange={(e) => handleUpdatePackSize(lineItem.id, e.target.value)}
                          placeholder="e.g. 80ml"
                          className="w-full h-9 pl-2.5 pr-8 rounded-lg bg-slate-950 border border-emerald-500/60 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdatePackSize(lineItem.id, "100ml")}
                          className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                          title="Switch to standard presets"
                        >
                          List
                        </button>
                      </div>
                    )}
                  </div>

                  {/* CHANGEABLE UNIT PRICE INPUT */}
                  <div className="w-full sm:w-32 shrink-0">
                    <div className="h-5 flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-300">
                        Unit Price (Rs)
                      </label>
                      {isPriceCustomized && (
                        <button
                          type="button"
                          onClick={() => handleResetPrice(lineItem.id, lineItem.variantId)}
                          className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                          title="Reset to default catalog price"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reset
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                        Rs
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={lineItem.price === 0 ? "0" : lineItem.price || ""}
                        onChange={(e) => handleUpdatePrice(lineItem.id, e.target.value)}
                        className={`w-full h-9 pl-8 pr-2.5 rounded-lg bg-slate-950 border text-sm font-mono text-right focus:outline-none transition-all ${isPriceCustomized
                          ? "border-amber-500/80 text-amber-300 focus:ring-1 focus:ring-amber-500/50"
                          : "border-slate-700/80 text-white focus:ring-1 focus:ring-emerald-500/50"
                          }`}
                      />
                    </div>
                  </div>

                  {/* Dispatch Quantity Input with Stepper Controls */}
                  <div className="w-full sm:w-36 shrink-0">
                    <div className="h-5 flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-400">
                        Dispatch Qty
                      </label>
                      {maxStock > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSetMaxStock(lineItem.id, lineItem.variantId)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono underline"
                        >
                          Max ({maxStock})
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(lineItem.id, -1)}
                        disabled={lineItem.quantity <= 1}
                        className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="number"
                        min="1"
                        max={maxStock}
                        value={lineItem.quantity || ""}
                        onChange={(e) => handleUpdateQuantity(lineItem.id, e.target.value)}
                        className={`w-full h-9 px-2 rounded-lg bg-slate-950 border text-sm font-mono text-center focus:outline-none transition-all ${isExceeded
                          ? "border-rose-500 text-rose-300 focus:ring-2 focus:ring-rose-500/40"
                          : "border-slate-700/80 text-white focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                          }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(lineItem.id, 1)}
                        disabled={lineItem.quantity >= maxStock}
                        className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isExceeded && (
                      <p className="text-[11px] text-rose-400 mt-1">
                        Exceeds stock (max {maxStock})
                      </p>
                    )}
                  </div>

                  {/* Line Total */}
                  <div className="w-full sm:w-28 shrink-0 text-right">
                    <div className="h-5 flex items-center justify-end mb-1">
                      <span className="text-[11px] font-medium text-slate-400">
                        Line Total
                      </span>
                    </div>
                    <div className="h-9 flex items-center justify-end">
                      <p className="text-sm font-mono font-bold text-white">
                        Rs {lineTotal.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <div className="self-end xl:self-center shrink-0 pt-1 xl:pt-5">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(lineItem.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remove product from dispatch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STEP 04: DISCOUNT & SHIPMENT VALUATION */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-sm p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold flex items-center justify-center">
              04
            </span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Discount &amp; Shipment Valuation
              </h2>
              <p className="text-xs text-slate-400">
                Apply distributor/wholesale discounts and calculate net invoice value.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Discount Controls */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-emerald-400" />
                Apply Shipment Discount
              </label>

              {/* Discount Type Toggle */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setDiscountType("percentage")}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${discountType === "percentage"
                    ? "bg-emerald-500 text-slate-950 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white"
                    }`}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("fixed")}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${discountType === "fixed"
                    ? "bg-emerald-500 text-slate-950 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white"
                    }`}
                >
                  Fixed (Rs)
                </button>
              </div>
            </div>

            <div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    discountType === "percentage"
                      ? "e.g. 10 for 10% off"
                      : "e.g. 1500 for Rs 1,500 off"
                  }
                  value={discountValue}
                  onChange={(e) => {
                    const val = e.target.value === "" ? "" : parseFloat(e.target.value);
                    setDiscountValue(isNaN(val as number) ? "" : (val as number));
                  }}
                  className="w-full pl-4 pr-16 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-semibold"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-400">
                  {discountType === "percentage" ? "%" : "PKR / Rs"}
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[11px] text-slate-500 mr-1">Quick Presets:</span>
                {discountType === "percentage" ? (
                  <>
                    {[5, 10, 15, 20, 25].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountValue(pct)}
                        className={`px-2 py-0.5 rounded text-xs font-mono border transition-all ${discountValue === pct
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                          : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                          }`}
                      >
                        {pct}%
                      </button>
                    ))}
                    {discountValue !== "" && (
                      <button
                        type="button"
                        onClick={() => setDiscountValue("")}
                        className="px-2 py-0.5 rounded text-xs font-mono text-rose-400 hover:underline ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDiscountValue(amt)}
                        className={`px-2 py-0.5 rounded text-xs font-mono border transition-all ${discountValue === amt
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                          : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                          }`}
                      >
                        Rs {amt.toLocaleString()}
                      </button>
                    ))}
                    {discountValue !== "" && (
                      <button
                        type="button"
                        onClick={() => setDiscountValue("")}
                        className="px-2 py-0.5 rounded text-xs font-mono text-rose-400 hover:underline ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Financial Breakdown Summary Box */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Invoice Calculation</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${paymentStatus === "paid"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
              >
                {paymentStatus === "paid" ? "Paid In Full" : "Payment Pending"}
              </span>
            </h3>

            <div className="space-y-2 text-sm pt-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Dispatched Items Subtotal:</span>
                <span className="font-mono font-semibold text-white">
                  Rs {subtotal.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span>Discount Applied:</span>
                  {discountAmount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      {discountType === "percentage" ? `${discountValue}% OFF` : "FLAT OFF"}
                    </span>
                  )}
                </span>
                <span
                  className={`font-mono font-semibold ${discountAmount > 0 ? "text-emerald-400" : "text-slate-500"
                    }`}
                >
                  - Rs {discountAmount.toLocaleString()}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-base font-bold text-white">Net Shipment Total:</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-400">
                  Rs {totalAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FINAL FLOATING ACTION BAR */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/95 backdrop-blur-md p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6  bottom-4 z-20">
        <div className="flex items-center gap-6 w-full md:w-auto flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Total Units
              </p>
              <p className="text-xl font-extrabold text-white font-mono">
                {totalQuantity} <span className="text-xs font-normal text-slate-400">units</span>
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden sm:block" />

          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Distinct Items
            </p>
            <p className="text-sm font-bold text-slate-300 font-mono">
              {uniqueItemCount} <span className="text-xs font-normal text-slate-500">SKUs</span>
            </p>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden sm:block" />

          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Net Total Value
            </p>
            <p className="text-lg font-bold text-emerald-400 font-mono">
              Rs {totalAmount.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <Link
            href={
              isEditMode && initialData
                ? `/dashboard/dispatch/${initialData.dispatchId}`
                : "/dashboard/dispatch/history"
            }
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-all"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSubmitting || items.length === 0 || totalQuantity <= 0 || hasExceededStock}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              isEditMode
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25"
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25"
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                {isEditMode ? "Updating & Reconciling Stock..." : "Deducting Stock & Syncing..."}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                {isEditMode ? "Save Changes & Update Receipt" : "Confirm & Dispatch Stock"}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
