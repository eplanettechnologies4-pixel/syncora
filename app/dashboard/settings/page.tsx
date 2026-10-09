import React from "react";
import { revalidatePath } from "next/cache";
import { requireShopAccess } from "@/lib/auth/shop-context";
import { createServerClient } from "@/lib/supabase/server";
import {
  Building2,
  Globe,
  MapPin,
  Phone,
  Mail,
  Coins,
  FileText,
  Save,
  ShieldCheck,
  Lock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { shopId, role, shopDomain } = await requireShopAccess();
  const supabase = createServerClient();

  const isOwner = role === "owner";

  // Fetch existing shop settings
  const { data: settings } = await supabase
    .from("shop_settings")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  // Server action to save business details
  async function updateBusinessDetails(formData: FormData) {
    "use server";
    const access = await requireShopAccess();
    if (access.role !== "owner") {
      throw new Error("Only store owners can update business details");
    }

    const sessionClient = createServerClient();

    const business_name = (formData.get("business_name") as string)?.trim() || null;
    const website = (formData.get("website") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const currency_label = (formData.get("currency_label") as string)?.trim() || "Rs";
    const challan_footer = (formData.get("challan_footer") as string)?.trim() || null;

    const { error } = await sessionClient
      .from("shop_settings")
      .upsert(
        {
          shop_id: access.shopId,
          business_name,
          website,
          address,
          phone,
          email,
          currency_label,
          challan_footer,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id" }
      );

    if (error) {
      console.error("Error updating shop settings:", error.message);
      throw new Error("Failed to save business details");
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/dispatch/[id]");
  }

  const defaultName = shopDomain ? shopDomain.replace(/\.myshopify\.com$/i, "") : "";

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Building2 className="w-6 h-6 text-emerald-400 stroke-[2.2]" />
          Store Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure business details, contact information, and delivery receipt branding.
        </p>
      </div>

      {/* Permission banner */}
      {!isOwner && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            You have read-only access as a team member. Only store owners can modify business details.
          </span>
        </div>
      )}

      {/* Business Details Form */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-sm p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Business details</h2>
            <p className="text-xs text-slate-400">
              Information displayed on customer receipts, delivery challans, and headers.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="capitalize">{role}</span>
          </div>
        </div>

        <form action={updateBusinessDetails} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Business Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                Business Name
              </label>
              <input
                type="text"
                name="business_name"
                disabled={!isOwner}
                defaultValue={settings?.business_name ?? defaultName}
                placeholder="e.g. Alaya Glow"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                Website URL
              </label>
              <input
                type="text"
                name="website"
                disabled={!isOwner}
                defaultValue={settings?.website ?? ""}
                placeholder="e.g. www.alayaglow.com.pk"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                Phone Number
              </label>
              <input
                type="text"
                name="phone"
                disabled={!isOwner}
                defaultValue={settings?.phone ?? ""}
                placeholder="e.g. 0300-1234567"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all font-mono"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                Email Address
              </label>
              <input
                type="email"
                name="email"
                disabled={!isOwner}
                defaultValue={settings?.email ?? ""}
                placeholder="e.g. support@alayaglow.com.pk"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              />
            </div>

            {/* Currency Label */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                Currency Label
              </label>
              <input
                type="text"
                name="currency_label"
                disabled={!isOwner}
                defaultValue={settings?.currency_label ?? "Rs"}
                placeholder="e.g. Rs, USD, AED"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all font-medium"
              />
            </div>

            {/* Physical Address */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                Physical Address
              </label>
              <input
                type="text"
                name="address"
                disabled={!isOwner}
                defaultValue={settings?.address ?? ""}
                placeholder="e.g. G3 The Business Center Regency Road Faisalabad"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              />
            </div>

            {/* Delivery Challan Footer */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                Challan Footer Note (Printed at bottom of receipt)
              </label>
              <textarea
                name="challan_footer"
                rows={3}
                disabled={!isOwner}
                defaultValue={settings?.challan_footer ?? ""}
                placeholder="e.g. Thank you for your business. Please check items upon delivery."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all resize-none"
              />
            </div>
          </div>

          {isOwner && (
            <div className="flex justify-end pt-4 border-t border-slate-800/80">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25"
              >
                <Save className="w-4 h-4 stroke-[2.5]" />
                <span>Save Business Details</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
