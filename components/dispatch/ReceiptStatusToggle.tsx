"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Check, Loader2, RotateCcw } from "lucide-react";

interface ReceiptStatusToggleProps {
  dispatchId: string;
  initialStatus: "paid" | "unpaid";
  paidAt?: string | null;
}

export default function ReceiptStatusToggle({
  dispatchId,
  initialStatus,
  paidAt: initialPaidAt,
}: ReceiptStatusToggleProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"paid" | "unpaid">(initialStatus);
  const [paidAt, setPaidAt] = useState<string | null>(initialPaidAt || null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUpdateStatus = async (newStatus: "paid" | "unpaid") => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/dispatch/payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchId,
          paymentStatus: newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update payment status");
      }

      setStatus(newStatus);
      setPaidAt(data.paidAt || null);
      router.refresh();
    } catch (err: any) {
      console.error("Status update error:", err);
      setErrorMessage(err.message || "Failed to update status");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2 print:hidden">
      {/* On-screen Interactive Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              status === "paid"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            }`}
          >
            {status === "paid" ? (
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <Clock className="w-4 h-4 stroke-[2.2]" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Payment Status:
              </span>
              <span
                className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md uppercase ${
                  status === "paid"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}
              >
                {status === "paid" ? "Paid In Full" : "Payment Pending / Unpaid"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {status === "paid"
                ? `Payment confirmed ${paidAt ? `on ${new Date(paidAt).toLocaleDateString()}` : ""}`
                : "Payment has not been received yet. Click the button to mark as paid."}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {status === "unpaid" ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleUpdateStatus("paid")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  Mark as Paid
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleUpdateStatus("unpaid")}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
              title="Revert back to unpaid"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="w-3 h-3" />
                  Mark as Unpaid
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="text-xs text-rose-400 font-medium px-1">{errorMessage}</p>
      )}
    </div>
  );
}
