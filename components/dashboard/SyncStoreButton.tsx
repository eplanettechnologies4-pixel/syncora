"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

export default function SyncStoreButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setFeedback(null);

    try {
      // 1. Sync products
      let cursor: string | null = null;
      let hasMore = true;
      let pageNum = 1;

      while (hasMore) {
        setProgressText(
          pageNum === 1 ? "Syncing products..." : `Syncing products (page ${pageNum})...`
        );
        const res: Response = await fetch("/api/sync-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });

        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const errMsg = data.error || `HTTP ${res.status}`;
          throw new Error(`Product sync failed: ${errMsg}`);
        }

        hasMore = Boolean(data.hasMore);
        cursor = data.cursor || null;
        pageNum++;
      }

      // 2. Sync inventory
      cursor = null;
      hasMore = true;
      pageNum = 1;

      while (hasMore) {
        setProgressText(
          pageNum === 1 ? "Syncing inventory..." : `Syncing inventory (page ${pageNum})...`
        );
        const res: Response = await fetch("/api/sync-inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });

        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const errMsg = data.error || `HTTP ${res.status}`;
          throw new Error(`Inventory sync failed: ${errMsg}`);
        }

        hasMore = Boolean(data.hasMore);
        cursor = data.cursor || null;
        pageNum++;
      }

      // 3. Sync orders
      cursor = null;
      hasMore = true;
      pageNum = 1;

      while (hasMore) {
        setProgressText(
          pageNum === 1 ? "Syncing orders..." : `Syncing orders (page ${pageNum})...`
        );
        const res: Response = await fetch("/api/sync-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });

        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const errMsg = data.error || `HTTP ${res.status}`;
          throw new Error(`Order sync failed: ${errMsg}`);
        }

        hasMore = Boolean(data.hasMore);
        cursor = data.cursor || null;
        pageNum++;
      }

      setFeedback({
        type: "success",
        message: "Store data synced successfully!",
      });

      router.refresh();
    } catch (err: any) {
      console.error("Store sync error:", err);
      setFeedback({
        type: "error",
        message: err.message || "Sync failed",
      });
    } finally {
      setIsSyncing(false);
      setProgressText(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold text-xs transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
        <span>{isSyncing ? progressText || "Syncing..." : "Sync Store from Shopify"}</span>
      </button>

      {feedback && (
        <div
          className={`flex items-center gap-1.5 text-xs font-medium animate-in fade-in duration-200 ${
            feedback.type === "success" ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
