import React from "react";
import AnalyticsOverview from "@/components/dashboard/AnalyticsOverview";
import SyncStoreButton from "@/components/dashboard/SyncStoreButton";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SyncStoreButton />
      </div>
      <AnalyticsOverview />
    </div>
  );
}
