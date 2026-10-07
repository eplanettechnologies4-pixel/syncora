"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Boxes,
  Users,
  Sparkles,
  Truck,
  History,
  Store,
} from "lucide-react";
import LogoutButton from "@/components/auth/LogoutButton";
import { APP_NAME } from "@/lib/brand";
import { supabase } from "@/lib/supabase";

export interface UserShopOption {
  id: string;
  domain: string;
  role: string;
}

interface SidebarProps {
  counts?: {
    products?: number;
    orders?: number;
    inventory?: number;
    customers?: number;
  };
  shopId?: string;
  shopDomain?: string;
  userEmail?: string;
  userRole?: string;
  shops?: UserShopOption[];
}

export default function Sidebar({
  counts,
  shopId,
  shopDomain,
  userEmail,
  userRole,
  shops,
}: SidebarProps) {
  const pathname = usePathname();
  const [countsState, setCountsState] = useState(counts);

  useEffect(() => {
    setCountsState(counts);
  }, [counts]);

  // Realtime subscription for sidebar counts scoped to shop_id
  useEffect(() => {
    if (!shopId) return;

    const fetchCounts = async () => {
      try {
        const [p, o, inv, c] = await Promise.all([
          supabase.from("products").select("*", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase.from("inventory").select("*", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase.from("customers").select("*", { count: "exact", head: true }).eq("shop_id", shopId),
        ]);
        setCountsState({
          products: p.count ?? 0,
          orders: o.count ?? 0,
          inventory: inv.count ?? 0,
          customers: c.count ?? 0,
        });
      } catch (err) {
        console.error("Error updating sidebar counts:", err);
      }
    };

    const filter = `shop_id=eq.${shopId}`;
    const channel = supabase
      .channel(`realtime-sidebar-counts-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter }, () => fetchCounts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  const isDashboardActive = pathname === "/dashboard";
  const isProductsActive = pathname === "/dashboard/products" || pathname.startsWith("/dashboard/products/");
  const isOrdersActive = pathname === "/dashboard/orders" || pathname.startsWith("/dashboard/orders/");
  const isInventoryActive = pathname === "/dashboard/inventory" || pathname.startsWith("/dashboard/inventory/");
  const isCustomersActive = pathname === "/dashboard/customers" || pathname.startsWith("/dashboard/customers/");
  const isDispatchActive = pathname === "/dashboard/dispatch";
  const isDispatchHistoryActive = pathname === "/dashboard/dispatch/history" || pathname.startsWith("/dashboard/dispatch/history/");

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      isActive: isDashboardActive,
      count: null,
    },
    {
      id: "products",
      label: "Products",
      href: "/dashboard/products",
      icon: Package,
      isActive: isProductsActive,
      count: countsState?.products,
    },
    {
      id: "orders",
      label: "Orders",
      href: "/dashboard/orders",
      icon: ShoppingCart,
      isActive: isOrdersActive,
      count: countsState?.orders,
    },
    {
      id: "inventory",
      label: "Inventory",
      href: "/dashboard/inventory",
      icon: Boxes,
      isActive: isInventoryActive,
      count: countsState?.inventory,
    },
    {
      id: "customers",
      label: "Customers",
      href: "/dashboard/customers",
      icon: Users,
      isActive: isCustomersActive,
      count: countsState?.customers,
    },
  ];

  const shopName = shopDomain
    ? shopDomain.replace(/\.myshopify\.com$/i, "")
    : APP_NAME;

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#0c1220]/90 backdrop-blur-md flex flex-col justify-between shrink-0 h-full select-none print:hidden">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800/80 gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white tracking-tight truncate max-w-[140px]" title={shopName}>
              {shopName}
            </p>
            <p className="text-[10px] text-emerald-400 font-medium tracking-wider uppercase">
              {APP_NAME}
            </p>
          </div>
        </div>

        {/* Store Selector (if multiple stores exist) */}
        {shops && shops.length > 1 && (
          <div className="px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <Store className="w-3 h-3 text-emerald-400" />
              <span>Switch Store</span>
            </div>
            <select
              value={shopId}
              onChange={(e) => {
                document.cookie = `active_shop_id=${e.target.value}; path=/; max-age=31536000; SameSite=Lax`;
                window.location.reload();
              }}
              className="w-full text-xs bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.domain.replace(/\.myshopify\.com$/i, "")} ({s.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Items */}
        <div className="px-3 py-5 space-y-6">
          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Management
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                      item.isActive
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-sm shadow-emerald-950"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          item.isActive
                            ? "text-emerald-400"
                            : "text-slate-400 group-hover:text-slate-200"
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.count !== null && item.count !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium transition-colors ${
                          item.isActive
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300"
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Warehouse Ops
            </div>
            <nav className="space-y-1">
              <Link
                href="/dashboard/dispatch"
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isDispatchActive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-sm shadow-emerald-950"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Truck
                    className={`w-4 h-4 transition-colors ${
                      isDispatchActive ? "text-emerald-400" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span>Dispatch Stock</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold uppercase">
                  Manual
                </span>
              </Link>
              <Link
                href="/dashboard/dispatch/history"
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isDispatchHistoryActive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-sm shadow-emerald-950"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <History
                    className={`w-4 h-4 transition-colors ${
                      isDispatchHistoryActive
                        ? "text-emerald-400"
                        : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span>Dispatch History</span>
                </div>
              </Link>
            </nav>
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-800/80 shrink-0">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xs font-semibold shrink-0 uppercase">
              {(userEmail?.[0] || "A").toUpperCase()}
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-medium text-slate-200 leading-none truncate max-w-[100px]" title={userEmail}>
                {userEmail || "Admin"}
              </div>
              <div className="text-[10px] text-emerald-400 mt-1 font-medium capitalize truncate max-w-[100px]">
                {userRole || "Administrator"}
              </div>
            </div>
          </div>
          <LogoutButton variant="sidebar" />
        </div>
      </div>
    </aside>
  );
}
