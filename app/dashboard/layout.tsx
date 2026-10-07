import React from "react";
import { supabaseServer } from "@/lib/supabase/server";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    { count: productsCount },
    { count: ordersCount },
    { count: inventoryCount },
    { count: customersCount },
  ] = await Promise.all([
    supabaseServer.from("products").select("*", { count: "exact", head: true }),
    supabaseServer.from("orders").select("*", { count: "exact", head: true }),
    supabaseServer.from("inventory").select("*", { count: "exact", head: true }),
    supabaseServer.from("customers").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#090d16] text-slate-100 font-sans print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Fixed Sidebar - Hidden on Print */}
      <div className="print:hidden">
        <Sidebar
          counts={{
            products: productsCount ?? 0,
            orders: ordersCount ?? 0,
            inventory: inventoryCount ?? 0,
            customers: customersCount ?? 0,
          }}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden print:h-auto print:overflow-visible print:block print:w-full">
        {/* Top Header - Hidden on Print */}
        <div className="print:hidden">
          <DashboardHeader />
        </div>

        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 print:p-0 print:m-0 print:overflow-visible print:h-auto print:block">
          {children}
        </main>
      </div>
    </div>
  );
}
