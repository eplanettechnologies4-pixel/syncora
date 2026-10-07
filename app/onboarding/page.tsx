import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClaimFromRequest } from "@/lib/auth/claim-cookie";
import { APP_NAME } from "@/lib/brand";
import { connectShopAction } from "./actions";
import {
  Store,
  Sparkles,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

interface OnboardingPageProps {
  searchParams?: {
    error?: string;
  };
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const cookieStore = cookies();

  // 1. Read and verify claim cookie
  const claim = getClaimFromRequest({
    cookies: cookieStore,
    headers: new Headers({ cookie: cookieStore.toString() }),
  } as any);

  let shopDomain: string | null = null;

  if (claim?.shopId) {
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("id, shop_domain")
      .eq("id", claim.shopId)
      .maybeSingle();

    if (shop) {
      shopDomain = shop.shop_domain;
    }
  }

  // 2. Check authenticated user session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only in Server Components
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-500/20">
            <Sparkles className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{APP_NAME}</h1>
          <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Store Connection Setup
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800/90 bg-[#0c1220]/80 backdrop-blur-xl p-8 shadow-2xl shadow-black/40 space-y-6">
          {searchParams?.error && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed flex-1">{searchParams.error}</div>
            </div>
          )}

          {!claim || !shopDomain ? (
            /* Invalid or missing claim state */
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-rose-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-white">Verification Failed</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  We could not verify your store install. Please install Syncora again from Shopify.
                </p>
              </div>
            </div>
          ) : !user ? (
            /* Valid claim but no logged-in user */
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <Store className="w-5 h-5" />
                  <span className="font-semibold text-sm">{shopDomain}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Store installed successfully. Sign in or create an account to link this store.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/signup"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 group"
                >
                  <span>Create account</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>

                <Link
                  href="/login?redirectedFrom=/onboarding"
                  className="w-full py-3 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white font-semibold text-sm transition-colors border border-slate-700/60 flex items-center justify-center gap-2"
                >
                  <span>Sign in</span>
                </Link>
              </div>
            </div>
          ) : (
            /* Valid claim and authenticated user */
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <Store className="w-5 h-5" />
                  <span className="font-bold text-sm">{shopDomain}</span>
                </div>
                <p className="text-xs text-slate-300">
                  Connect <strong className="text-white">{shopDomain}</strong> to your account?
                </p>
                <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 pt-1">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Signed in as {user.email}</span>
                </div>
              </div>

              <form action={connectShopAction}>
                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 group"
                >
                  <span>Connect Store</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </form>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500">Secure onboarding</p>
          </div>
        </div>
      </div>
    </div>
  );
}
