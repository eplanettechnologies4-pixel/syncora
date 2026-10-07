"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, Loader2, X, RotateCcw } from "lucide-react";

interface DeleteDispatchButtonProps {
  dispatchId: string;
  recipientName: string;
  className?: string;
  onDeleted?: () => void;
  redirectOnDelete?: string;
  variant?: "table" | "header";
}

export default function DeleteDispatchButton({
  dispatchId,
  recipientName,
  className = "",
  onDeleted,
  redirectOnDelete,
  variant = "table",
}: DeleteDispatchButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [restoreStock, setRestoreStock] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/dispatch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchId,
          restoreInventory: restoreStock,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete dispatch record");
      }

      setIsOpen(false);
      if (redirectOnDelete) {
        router.push(redirectOnDelete);
        router.refresh();
      } else if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } catch (err: any) {
      console.error("Delete dispatch error:", err);
      setErrorMessage(err.message || "Failed to delete record");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {variant === "table" ? (
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsOpen(true);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/30 text-xs font-medium transition-all shadow-sm active:scale-95 ${className}`}
          title="Delete this dispatch receipt completely from backend"
        >
          <Trash2 className="w-3.5 h-3.5 stroke-[2]" />
          <span>Delete</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsOpen(true);
          }}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/40 text-xs font-semibold transition-all shadow-sm active:scale-95 ${className}`}
          title="Delete receipt permanently"
        >
          <Trash2 className="w-3.5 h-3.5 stroke-[2]" />
          <span>Delete Receipt</span>
        </button>
      )}

      {/* Confirmation Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full bg-[#0c1220] border border-slate-800 rounded-2xl shadow-2xl p-6 text-left text-slate-100 space-y-4" style={{ maxWidth: "33rem" }}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Delete Dispatch Record
                  </h3>
                  <p className="text-xs text-slate-400">
                    ID: <span className="font-mono text-slate-300">{dispatchId.slice(0, 8)}...</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isDeleting}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Description */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-2 text-slate-300">
              <p style={{ whiteSpace: "normal" }}>
                Are you sure you want to completely delete the dispatch receipt for{" "}
                <strong className="text-white">{recipientName}</strong>?
              </p>
              <p className="text-[11px] text-rose-300/90 font-medium" style={{ whiteSpace: "normal" }}>
                ⚠️ This will permanently remove the record and all associated line items from the backend database.
              </p>
            </div>

            {/* Restore Stock Checkbox */}
            <label className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/10 transition-colors">
              <input
                type="checkbox"
                checked={restoreStock}
                onChange={(e) => setRestoreStock(e.target.checked)}
                disabled={isDeleting}
                className="mt-0.5 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore Stock to Inventory
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5" style={{ whiteSpace: "normal" }}>
                  Automatically add deducted quantities back into warehouse stock and sync with Shopify.
                </p>
              </div>
            </label>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting from DB...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 stroke-[2]" />
                    <span>Delete Record</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
