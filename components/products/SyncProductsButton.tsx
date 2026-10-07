"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function SyncProductsButton() {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      let cursor: string | null = null;
      let hasMore = true;
      while (hasMore) {
        const res: Response = await fetch("/api/sync-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        const data: any = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to sync products");
        }
        hasMore = Boolean(data.hasMore);
        cursor = data.cursor || null;
      }
      window.location.reload();
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
