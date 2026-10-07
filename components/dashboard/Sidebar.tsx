"use client";

import React from "react";
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
} from "lucide-react";
import LogoutButton from "@/components/auth/LogoutButton";

interface SidebarProps {
  counts?: {
    products?: number;
    orders?: number;
    inventory?: number;
    customers?: number;
  };
}

export default function Sidebar({ counts }: SidebarProps) {
  const pathname = usePathname();

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
      count: counts?.products,
    },
    {
      id: "orders",
      label: "Orders",
      href: "/dashboard/orders",
      icon: ShoppingCart,
      isActive: isOrdersActive,
      count: counts?.orders,
    },
    {
      id: "inventory",
      label: "Inventory",
      href: "/dashboard/inventory",
      icon: Boxes,
      isActive: isInventoryActive,
      count: counts?.inventory,
    },
    {
      id: "customers",
      label: "Customers",
      href: "/dashboard/customers",
      icon: Users,
      isActive: isCustomersActive,
      count: counts?.customers,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#0c1220]/90 backdrop-blur-md flex flex-col justify-between shrink-0 h-full select-none print:hidden">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800/80 gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight">Alaya Glow</p>
            <p className="text-[10px] text-emerald-400 font-medium tracking-wider uppercase">
              ERP Portal
            </p>
          </div>
        </div>

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
                    {typeof item.count === "number" && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          item.isActive
                            ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                            : "bg-slate-800 text-slate-400"
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
              Operations
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
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xs font-semibold shrink-0">
              AG
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-medium text-slate-200 leading-none truncate">Admin</div>
              <div className="text-[10px] text-emerald-400 mt-1 font-medium">Administrator</div>
            </div>
          </div>
          <LogoutButton variant="sidebar" />
        </div>
      </div>
    </aside>
  );
}
