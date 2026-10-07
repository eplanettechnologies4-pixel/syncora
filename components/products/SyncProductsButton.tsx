"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function SyncProductsButton() {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync-products");
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      } else {
        alert("Sync error: " + (data.error || "Failed to sync products"));
      }
    } catch (err: any) {
      alert("Failed to trigger product sync: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition-all shadow-sm disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Syncing from Shopify..." : "Sync Products from Shopify"}
    </button>
  );
}
