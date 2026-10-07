"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";

interface ChallanPaymentDropdownProps {
  dispatchId: string;
  initialStatus: "paid" | "unpaid";
}

export default function ChallanPaymentDropdown({
  dispatchId,
  initialStatus,
}: ChallanPaymentDropdownProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"paid" | "unpaid">(initialStatus);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as "paid" | "unpaid";
    if (newStatus === status) return;

    setIsLoading(true);
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
      router.refresh();
    } catch (err) {
      console.error("Status update error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative inline-flex items-center w-full">
      {/* On print: clean text */}
      <span className="hidden print:inline text-xs capitalize text-black font-normal">
        {status === "paid" ? "Paid" : "Unpaid"}
      </span>

      {/* On screen: exact interactive select with dotted underline and chevron */}
      <div className="print:hidden relative w-full flex items-center">
        {isLoading && (
          <Loader2 className="w-3 h-3 animate-spin text-gray-500 absolute left-1" />
        )}
        <select
          value={status}
          onChange={handleChange}
          disabled={isLoading}
          className={`w-full appearance-none bg-transparent text-xs font-normal text-gray-900 pr-5 py-0.5 focus:outline-none cursor-pointer border-b border-dotted border-gray-400 hover:border-gray-800 transition-colors ${
            isLoading ? "opacity-50 pl-5" : ""
          }`}
        >
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-600 pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}
