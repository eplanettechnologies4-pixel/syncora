"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Bell,
  ChevronRight,
} from "lucide-react";
import LogoutButton from "@/components/auth/LogoutButton";

export default function DashboardHeader() {
  const pathname = usePathname();

  const getBreadcrumbTitle = () => {
    if (pathname === "/dashboard") return "Analytics Overview";
    if (pathname.startsWith("/dashboard/products")) return "Products Catalog";
    if (pathname.startsWith("/dashboard/orders")) return "Orders";
    if (pathname.startsWith("/dashboard/inventory")) return "Inventory Stock";
    if (pathname.startsWith("/dashboard/customers")) return "Customers";
    if (pathname === "/dashboard/dispatch") return "Dispatch Stock";
    if (pathname.startsWith("/dashboard/dispatch/history")) return "Dispatch History";
    return "Overview";
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#0c1220]/60 backdrop-blur-md px-6 md:px-8 flex items-center justify-between shrink-0 print:hidden">
      <div className="flex items-center gap-3">
        <div className="flex items-center text-sm text-slate-400">
          <LayoutDashboard className="w-4 h-4 mr-2 text-slate-400" />
          <span>CRM</span>
          <ChevronRight className="w-4 h-4 mx-1.5 text-slate-500" />
          <span className="text-slate-200 font-medium">{getBreadcrumbTitle()}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search records..."
            disabled
            className="bg-slate-900/80 border border-slate-800 text-xs rounded-xl pl-9 pr-4 py-2 text-slate-400 placeholder-slate-500 focus:outline-none w-52 cursor-not-allowed opacity-75"
          />
        </div>

        <button
          type="button"
          className="p-2 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xs font-semibold">
              AG
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-medium text-slate-200 leading-none">Admin</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Administrator</div>
            </div>
          </div>
          <LogoutButton variant="header" />
        </div>
      </div>
    </header>
  );
}
