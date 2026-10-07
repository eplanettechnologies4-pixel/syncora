import React from "react";
import AnalyticsOverview from "@/components/dashboard/AnalyticsOverview";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <AnalyticsOverview />
    </div>
  );
}
