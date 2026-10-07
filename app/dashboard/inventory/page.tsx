import React from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import InventoryTable, { InventoryItemData } from "@/components/inventory/InventoryTable";
import { Boxes, Truck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const { data } = await supabaseServer
    .from("inventory")
    .select(
      `
      id,
      variant_id,
      quantity,
      updated_at,
      product_variants (
        id,
        shopify_variant_id,
        title,
        sku,
        products (
          id,
          title,
          image_url
        )
      )
    `
    )
    .order("updated_at", { ascending: false });

  const inventoryList = (data as unknown as InventoryItemData[]) || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Boxes className="w-6 h-6 text-emerald-400 stroke-[2.2]" />
            Inventory Stock
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time stock levels synchronized across Shopify variants and manual dispatches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/dispatch"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/20"
          >
            <Truck className="w-4 h-4 stroke-[2.5]" />
            Dispatch Stock
          </Link>
        </div>
      </div>

      {/* Inventory Table Container */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/70 backdrop-blur-sm overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Tracked Stock Items</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Showing {inventoryList.length} tracked items from Shopify &amp; Supabase
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Table: <span className="text-emerald-400">inventory</span>
          </div>
        </div>

        <InventoryTable initialItems={inventoryList} />
      </div>
    </div>
  );
}
