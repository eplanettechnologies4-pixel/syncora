"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Check, Loader2 } from "lucide-react";

interface DispatchPrintStatusBadgeProps {
  dispatchId: string;
  initialIsPrinted: boolean;
  initialPrintedAt?: string | null;
  size?: "sm" | "md";
  interactive?: boolean;
  onStatusChange?: (isPrinted: boolean) => void;
}

export default function DispatchPrintStatusBadge({
  dispatchId,
  initialIsPrinted,
  initialPrintedAt,
  size = "sm",
  interactive = true,
  onStatusChange,
}: DispatchPrintStatusBadgeProps) {
  const router = useRouter();
  const [isPrinted, setIsPrinted] = useState<boolean>(initialIsPrinted);
  const [printedAt, setPrintedAt] = useState<string | null>(initialPrintedAt || null);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    if (!interactive || isLoading) return;
    e.preventDefault();
    e.stopPropagation();

    const nextState = !isPrinted;
    const prevState = isPrinted;
    const prevPrintedAt = printedAt;

    // Optimistic update
    setIsPrinted(nextState);
    if (nextState) {
      setPrintedAt(new Date().toISOString());
    } else {
      setPrintedAt(null);
    }
    setIsLoading(true);

    try {
      const res = await fetch("/api/dispatch/print-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchId,
          isPrinted: nextState,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update print status");
      }

      setPrintedAt(data.printedAt || null);
      onStatusChange?.(nextState);
      router.refresh();
    } catch (err) {
      console.error("Print status toggle error:", err);
      // Revert on error
      setIsPrinted(prevState);
      setPrintedAt(prevPrintedAt);
    } finally {
      setIsLoading(false);
    }
  };

  const formattedDate = printedAt
    ? new Date(printedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const tooltipText = isPrinted
    ? `Status: Printed ${formattedDate ? `(${formattedDate})` : ""}. Click to mark as Not Printed.`
    : "Status: Not Printed yet. Click to mark as Printed.";

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!interactive || isLoading}
      title={tooltipText}
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-semibold transition-all border shadow-sm select-none ${
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs"
      } ${
        isPrinted
          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 focus:ring-1 focus:ring-emerald-400"
          : "bg-slate-900/90 border-slate-700/70 text-slate-400 hover:text-slate-200 hover:border-slate-600 focus:ring-1 focus:ring-slate-500"
      } ${interactive ? "cursor-pointer active:scale-95" : "cursor-default"} ${
        isLoading ? "opacity-60 cursor-wait" : ""
      }`}
    >
      {/* Indicator Dot / Spinner */}
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin text-slate-300 shrink-0" />
      ) : isPrinted ? (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] shrink-0" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
      )}

      {/* Icon */}
      {isPrinted ? (
        <Check className="w-3 h-3 stroke-[2.5] text-emerald-400 shrink-0" />
      ) : (
        <Printer className="w-3 h-3 stroke-[2] text-slate-400 shrink-0" />
      )}

      {/* Status Label */}
      <span>{isPrinted ? "Printed" : "Not Printed"}</span>
    </button>
  );
}
