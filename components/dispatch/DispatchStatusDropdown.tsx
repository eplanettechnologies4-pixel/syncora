"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";

interface DispatchStatusDropdownProps {
  dispatchId: string;
  initialStatus: "paid" | "unpaid";
  size?: "sm" | "md";
}

export default function DispatchStatusDropdown({
  dispatchId,
  initialStatus,
  size = "sm",
}: DispatchStatusDropdownProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"paid" | "unpaid">(initialStatus);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as "paid" | "unpaid";
    if (newStatus === status) return;

    setIsLoading(true);
    const prevStatus = status;
    setStatus(newStatus); // Optimistic update

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

      router.refresh();
    } catch (err) {
      console.error("Status update error:", err);
      // Revert on failure
      setStatus(prevStatus);
    } finally {
      setIsLoading(false);
    }
  };

  const isPaid = status === "paid";

  return (
    <div className="relative inline-flex items-center">
      {/* Indicator Dot or Spinner */}
      <div className="absolute left-2.5 pointer-events-none flex items-center justify-center">
        {isLoading ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-300" />
        ) : (
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPaid
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
            }`}
          />
        )}
      </div>

      <select
        value={status}
        onChange={handleChange}
        disabled={isLoading}
        title="Click to change payment status"
        className={`appearance-none cursor-pointer pl-6 pr-6 py-1 rounded-full text-xs font-semibold font-mono border transition-all focus:outline-none focus:ring-1 ${
          isPaid
            ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 focus:ring-emerald-400"
            : "bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25 focus:ring-amber-400"
        } ${isLoading ? "opacity-60 cursor-wait" : ""}`}
      >
        <option value="unpaid" className="bg-slate-900 text-amber-300 font-sans font-medium">
          Unpaid
        </option>
        <option value="paid" className="bg-slate-900 text-emerald-300 font-sans font-medium">
          Paid
        </option>
      </select>

      {/* Dropdown Chevron */}
      <ChevronDown
        className={`w-3 h-3 pointer-events-none absolute right-2 transition-colors ${
          isPaid ? "text-emerald-400/70" : "text-amber-400/70"
        }`}
      />
    </div>
  );
}
