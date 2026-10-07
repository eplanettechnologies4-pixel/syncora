import React from "react";
import { supabaseServer } from "@/lib/supabase/server";
import CustomersView, { CustomerData } from "@/components/customers/CustomersView";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { data: rawCustomers, error } = await supabaseServer
    .from("customers")
    .select("*")
    .order("total_spent", { ascending: false });

  if (error) {
    console.error("Error fetching customers:", error);
  }

  const initialCustomers: CustomerData[] = (rawCustomers || []).map((c: any) => ({
    id: c.id,
    shopify_customer_id: c.shopify_customer_id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone || null,
    total_orders: c.total_orders || 0,
    total_spent:
      typeof c.total_spent === "number"
        ? c.total_spent
        : parseFloat(c.total_spent || "0"),
    created_at: c.created_at,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-slate-800/80">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Users className="w-6 h-6 text-emerald-400 stroke-[2.2]" />
          Customers Directory
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Customer profiles, order frequency, and lifetime spend synced live with Shopify.
        </p>
      </div>

      <CustomersView initialCustomers={initialCustomers} />
    </div>
  );
}
