"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShoppingCart,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Package,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ExternalLink,
  DollarSign,
  Layers,
  Phone,
  Mail,
} from "lucide-react";

export interface OrderLineItem {
  id: string;
  quantity: number;
  price: number;
  variantTitle?: string | null;
  productTitle?: string | null;
}

export interface OrderData {
  id: string;
  shopify_order_id: number;
  order_number: string;
  total_price: number;
  financial_status: string;
  fulfillment_status: string;
  created_at: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  items_count: number;
  line_items: OrderLineItem[];
}

interface OrdersViewProps {
  initialOrders: OrderData[];
}

function formatCurrency(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function OrdersView({ initialOrders }: OrdersViewProps) {
  const [orders, setOrders] = useState<OrderData[]>(initialOrders);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; id: string } | null>(null);

  // Auto-dismiss toast after 4.5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Supabase Realtime Subscription on "orders"
  useEffect(() => {
    const channel = supabase
      .channel("realtime-orders-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const newOrder = payload.new as any;
          const orderNum = newOrder.order_number || `#${newOrder.shopify_order_id}`;

          // Trigger live toast
          setToast({
            message: `New order received: ${orderNum}`,
            id: crypto.randomUUID(),
          });

          // Query joined details for customer & items
          try {
            const { data: fullOrder, error } = await supabase
              .from("orders")
              .select(
                `
                id,
                shopify_order_id,
                order_number,
                total_price,
                financial_status,
                fulfillment_status,
                created_at,
                customers (
                  first_name,
                  last_name,
                  email,
                  phone
                ),
                order_line_items (
                  id,
                  quantity,
                  price,
                  product_variants (
                    title,
                    products (
                      title
                    )
                  )
                )
              `
              )
              .eq("id", newOrder.id)
              .maybeSingle();

            if (fullOrder && !error) {
              const cust = (fullOrder as any).customers;
              const customerName =
                `${cust?.first_name || ""} ${cust?.last_name || ""}`.trim() || "Guest Customer";

              const rawItems = (fullOrder as any).order_line_items || [];
              const items: OrderLineItem[] = rawItems.map((it: any) => ({
                id: it.id,
                quantity: it.quantity || 1,
                price: typeof it.price === "number" ? it.price : parseFloat(it.price || "0"),
                variantTitle: it.product_variants?.title,
                productTitle: it.product_variants?.products?.title,
              }));

              const formattedOrder: OrderData = {
                id: fullOrder.id,
                shopify_order_id: fullOrder.shopify_order_id,
                order_number: fullOrder.order_number || `#${fullOrder.shopify_order_id}`,
                total_price:
                  typeof fullOrder.total_price === "number"
                    ? fullOrder.total_price
                    : parseFloat(fullOrder.total_price || "0"),
                financial_status: fullOrder.financial_status || "pending",
                fulfillment_status: fullOrder.fulfillment_status || "unfulfilled",
                created_at: fullOrder.created_at,
                customer_name: customerName,
                customer_email: cust?.email || null,
                customer_phone: cust?.phone || null,
                items_count: items.reduce((sum, item) => sum + item.quantity, 0),
                line_items: items,
              };

              setOrders((prev) => {
                if (prev.some((o) => o.id === formattedOrder.id)) return prev;
                return [formattedOrder, ...prev];
              });
            }
          } catch (err) {
            console.error("Error fetching newly inserted order details:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.customer_email &&
          order.customer_email.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "all" ||
        order.financial_status.toLowerCase() === statusFilter.toLowerCase() ||
        order.fulfillment_status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const handleSyncOrders = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync-orders");
      const data = await res.json();
      if (data.success) {
        setToast({
          message: `Orders synced: ${data.ordersSynced} orders processed`,
          id: crypto.randomUUID(),
        });
        // Reload page data to capture joined updates
        window.location.reload();
      } else {
        alert("Sync error: " + (data.error || "Failed to sync orders"));
      }
    } catch (err: any) {
      console.error("Order sync trigger error:", err);
      alert("Failed to sync orders: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Realtime Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 border border-emerald-500/40 text-white shadow-2xl shadow-emerald-950 backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-400">Live Update</p>
              <p className="text-xs text-slate-200">{toast.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar: Search, Filters & Sync */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by order #, customer name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Filter pills */}
          <div className="hidden sm:flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            {["all", "paid", "pending", "fulfilled", "unfulfilled"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-all ${
                  statusFilter === f
                    ? "bg-emerald-500/15 text-emerald-400 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSyncOrders}
          disabled={isSyncing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing Shopify Orders..." : "Sync Orders from Shopify"}
        </button>
      </div>

      {/* Orders List / Cards */}
      <div className="space-y-3">
        {filteredOrders.length > 0 ? (
          filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const isPaid = order.financial_status.toLowerCase() === "paid";
            const isFulfilled = order.fulfillment_status.toLowerCase() === "fulfilled";

            return (
              <div
                key={order.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isExpanded
                    ? "border-emerald-500/40 bg-[#0c1322] shadow-xl shadow-emerald-950/20"
                    : "border-slate-800/80 bg-[#0c1220]/70 hover:border-slate-700/90 hover:bg-[#0c1220]"
                }`}
              >
                {/* Main Order Card Header */}
                <div
                  onClick={() => toggleExpand(order.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start md:items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 md:mt-0">
                      <ShoppingCart className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-bold text-white font-mono tracking-tight">
                          {order.order_number}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                          }`}
                        >
                          {order.financial_status}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                            isFulfilled
                              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/25"
                              : "bg-slate-800 text-slate-400 border-slate-700/60"
                          }`}
                        >
                          {order.fulfillment_status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {order.customer_name}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {formatDate(order.created_at)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5 font-mono">
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                          {order.items_count} {order.items_count === 1 ? "item" : "items"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Total Amount
                      </p>
                      <p className="text-lg font-extrabold text-white font-mono">
                        {formatCurrency(order.total_price)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`p-2 rounded-xl border transition-all ${
                          isExpanded
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                        title={isExpanded ? "Collapse items" : "Expand items"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-800/80 bg-slate-950/60 p-6 space-y-6 animate-in fade-in-50 duration-150">
                    {/* Customer Info row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                          Customer
                        </p>
                        <p className="font-semibold text-white">{order.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                          Email
                        </p>
                        <p className="text-slate-300 font-mono">
                          {order.customer_email || "No email recorded"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                          Phone
                        </p>
                        <p className="text-slate-300 font-mono">
                          {order.customer_phone || "No phone recorded"}
                        </p>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        Ordered Items ({order.line_items.length})
                      </h4>

                      {order.line_items.length > 0 ? (
                        <div className="border border-slate-800 rounded-xl overflow-hidden">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                                <th className="py-2.5 px-4">Product / Item</th>
                                <th className="py-2.5 px-4">Variant</th>
                                <th className="py-2.5 px-4 text-right">Unit Price</th>
                                <th className="py-2.5 px-4 text-center">Qty</th>
                                <th className="py-2.5 px-4 text-right">Line Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 text-slate-200">
                              {order.line_items.map((item, idx) => {
                                const lineTotal = (item.price || 0) * (item.quantity || 1);
                                return (
                                  <tr key={item.id || idx} className="hover:bg-slate-900/30">
                                    <td className="py-3 px-4 font-medium text-white">
                                      {item.productTitle || "Shopify Product"}
                                    </td>
                                    <td className="py-3 px-4 text-slate-400">
                                      {item.variantTitle && item.variantTitle !== "Default Title"
                                        ? item.variantTitle
                                        : "—"}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                                      {formatCurrency(item.price)}
                                    </td>
                                    <td className="py-3 px-4 text-center font-mono font-bold text-white">
                                      {item.quantity}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-400">
                                      {formatCurrency(lineTotal)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic py-2">
                          No line items recorded for this order.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/60 p-16 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-400">
              <ShoppingCart className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-200">No Orders Found</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                {searchQuery || statusFilter !== "all"
                  ? "No orders match your filter criteria. Try adjusting your search query."
                  : "Orders will automatically appear here live via webhooks whenever a customer places an order on Shopify."}
              </p>
            </div>
            {!searchQuery && statusFilter === "all" && (
              <button
                onClick={handleSyncOrders}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Past Orders Now"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
