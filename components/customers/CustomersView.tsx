"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Search,
  Mail,
  Phone,
  ShoppingCart,
  DollarSign,
  Sparkles,
  ArrowUpDown,
  Calendar,
  User,
} from "lucide-react";

export interface CustomerData {
  id: string;
  shopify_customer_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
}

interface CustomersViewProps {
  initialCustomers: CustomerData[];
}

function formatCurrency(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  const f = firstName?.[0]?.toUpperCase() || "";
  const l = lastName?.[0]?.toUpperCase() || "";
  return f + l || "C";
}

export default function CustomersView({ initialCustomers }: CustomersViewProps) {
  const [customers, setCustomers] = useState<CustomerData[]>(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "spent" | "orders">("spent");
  const [toast, setToast] = useState<{ message: string; id: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Realtime subscription on "customers" table (INSERTS & UPDATES)
  useEffect(() => {
    const channel = supabase
      .channel("realtime-customers-cards")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newCust = payload.new as any;
            const fullName =
              `${newCust.first_name || ""} ${newCust.last_name || ""}`.trim() || "New Customer";

            setToast({
              message: `New customer registered: ${fullName}`,
              id: crypto.randomUUID(),
            });

            const formatted: CustomerData = {
              id: newCust.id,
              shopify_customer_id: newCust.shopify_customer_id,
              first_name: newCust.first_name,
              last_name: newCust.last_name,
              email: newCust.email,
              phone: newCust.phone,
              total_orders: newCust.total_orders || 0,
              total_spent: typeof newCust.total_spent === "number" ? newCust.total_spent : parseFloat(newCust.total_spent || "0"),
              created_at: newCust.created_at,
            };

            setCustomers((prev) => {
              if (prev.some((c) => c.id === formatted.id)) return prev;
              return [formatted, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as any;
            setCustomers((prev) =>
              prev.map((c) => {
                if (c.id !== updated.id) return c;
                return {
                  ...c,
                  first_name: updated.first_name,
                  last_name: updated.last_name,
                  email: updated.email,
                  phone: updated.phone,
                  total_orders: updated.total_orders ?? c.total_orders,
                  total_spent:
                    typeof updated.total_spent === "number"
                      ? updated.total_spent
                      : parseFloat(updated.total_spent || String(c.total_spent)),
                };
              })
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const email = (c.email || "").toLowerCase();
        const phone = (c.phone || "").toLowerCase();
        const q = searchQuery.toLowerCase();
        return fullName.includes(q) || email.includes(q) || phone.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === "spent") return (b.total_spent || 0) - (a.total_spent || 0);
        if (sortBy === "orders") return (b.total_orders || 0) - (a.total_orders || 0);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [customers, searchQuery, sortBy]);

  return (
    <div className="space-y-6">
      {/* Realtime Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 border border-emerald-500/40 text-white shadow-2xl shadow-emerald-950 backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-400">Live Customer Added</p>
              <p className="text-xs text-slate-200">{toast.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Controls: Search & Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sort By:</span>
          </div>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-sans"
          >
            <option value="spent">Highest Spender</option>
            <option value="orders">Most Orders</option>
            <option value="recent">Recently Added</option>
          </select>
        </div>
      </div>

      {/* Customers Card Grid */}
      {filteredCustomers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCustomers.map((customer) => {
            const fullName =
              `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
              "Anonymous Customer";
            const initials = getInitials(customer.first_name, customer.last_name);

            return (
              <div
                key={customer.id}
                className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/75 hover:border-slate-700 hover:bg-[#0e1526] p-6 transition-all duration-200 shadow-lg hover:shadow-xl flex flex-col justify-between group"
              >
                {/* Top: Avatar & Name */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-400/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm shadow-inner shrink-0">
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                          {fullName}
                        </h3>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          Joined {formatDate(customer.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details */}
                  <div className="space-y-2 py-3 border-t border-slate-800/60 text-xs">
                    <div className="flex items-center gap-2.5 text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate font-mono text-[11px]">
                        {customer.email || "No email available"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-mono text-[11px]">
                        {customer.phone || "No phone available"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Metrics Pills */}
                <div className="pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-3 mt-4">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-400 mb-0.5">
                      <ShoppingCart className="w-3 h-3 text-slate-500" />
                      Orders
                    </div>
                    <p className="text-sm font-extrabold text-white font-mono">
                      {customer.total_orders || 0}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-emerald-400 mb-0.5">
                      <DollarSign className="w-3 h-3 text-emerald-500" />
                      Total Spent
                    </div>
                    <p className="text-sm font-extrabold text-emerald-300 font-mono">
                      {formatCurrency(customer.total_spent || 0)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/60 p-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-400">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-200">No Customers Found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? "No customers match your search query. Try another keyword."
              : "Customers will appear here automatically when orders are processed or synced from Shopify."}
          </p>
        </div>
      )}
    </div>
  );
}
