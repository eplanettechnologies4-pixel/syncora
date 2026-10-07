import React from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Plus, History } from "lucide-react";
import DispatchHistoryTable from "@/components/dispatch/DispatchHistoryTable";

export const dynamic = "force-dynamic";

export default async function DispatchHistoryPage() {
  const { data: dispatches, error } = await supabaseServer
    .from("manual_dispatches")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching dispatch history:", error);
  }

  const dispatchList = dispatches || [];

  return (
    <div className="space-y-6" style={{ height: "100%" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-emerald-400 stroke-[2.2]" />
            Stock Dispatch History
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Past manual dispatches and inventory deductions. Manage status and click any record to view its receipt.
          </p>
        </div>

        <Link
          href="/dashboard/dispatch"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          New Dispatch
        </Link>
      </div>

      {/* Interactive Table with Live Status Options, Search, and Contact Details */}
      <DispatchHistoryTable initialDispatches={dispatchList} />
    </div>
  );
}
