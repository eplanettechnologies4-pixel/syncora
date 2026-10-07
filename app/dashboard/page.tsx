import React from "react";
import { requireShopAccess } from "@/lib/auth/shop-context";
import AnalyticsOverview from "@/components/dashboard/AnalyticsOverview";
import SyncStoreButton from "@/components/dashboard/SyncStoreButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { shopId } = await requireShopAccess();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SyncStoreButton />
      </div>
      <AnalyticsOverview shopId={shopId} />
    </div>
  );
}
