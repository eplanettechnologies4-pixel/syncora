"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Loader2 } from "lucide-react";

interface PrintButtonProps {
  dispatchId?: string;
  initialIsPrinted?: boolean;
  className?: string;
}

export default function PrintButton({
  dispatchId,
  initialIsPrinted = false,
  className = "",
}: PrintButtonProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePrint = async () => {
    // 1. Immediately trigger window print
    window.print();

    // 2. Mark this dispatch as printed in database if dispatchId provided
    if (dispatchId) {
      try {
        setIsUpdating(true);
        const res = await fetch("/api/dispatch/print-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dispatchId,
            isPrinted: true,
          }),
        });

        if (res.ok) {
          router.refresh();
        }
      } catch (err) {
        console.error("Failed to update print status:", err);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={isUpdating}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-75 ${className}`}
      title="Print delivery challan & mark receipt as printed"
    >
      {isUpdating ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
      ) : (
        <Printer className="w-4 h-4 stroke-[2.2]" />
      )}
      <span>Print Receipt</span>
    </button>
  );
}
