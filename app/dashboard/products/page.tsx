import React from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { Package, Boxes, ImageIcon, RefreshCw } from "lucide-react";
import SyncProductsButton from "@/components/products/SyncProductsButton";

export const dynamic = "force-dynamic";

function formatProductPrice(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min === null || min === undefined) return "—";
  const fmt = (n: number) =>
    Math.round(n).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });

  if (max === null || max === undefined || min === max) {
    return `Rs ${fmt(min)}`;
  }
  return `Rs ${fmt(min)} - Rs ${fmt(max)}`;
}

export default async function ProductsPage() {
  const { data: productsData } = await supabaseServer
    .from("products")
    .select(
      `
      id,
      shopify_product_id,
      title,
      vendor,
      product_type,
      status,
      image_url,
      price_min,
      price_max,
      updated_at,
      product_variants (
        id
      )
    `
    )
    .order("title", { ascending: true });

  const productsList = productsData || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Package className="w-6 h-6 text-emerald-400 stroke-[2.2]" />
            Products Catalog
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time catalog synchronized directly from your Shopify store.
          </p>
        </div>

        <SyncProductsButton />
      </div>

      {/* Products Catalog Table Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/70 backdrop-blur-sm overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">All Products</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Showing {productsList.length} products synced from Shopify
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Table: <span className="text-emerald-400">products</span>
          </div>
        </div>

        {productsList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Product</th>
                  <th className="py-3 px-6">Vendor</th>
                  <th className="py-3 px-6">Price</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Variants</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {productsList.map((product) => {
                  const variantCount = product.product_variants?.length || 0;
                  const isDraft = product.status?.toLowerCase() === "draft";
                  const priceDisplay = formatProductPrice(
                    product.price_min,
                    product.price_max
                  );

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-slate-800/30 transition-colors duration-100"
                    >
                      <td className="py-3 px-6 font-medium text-white">
                        <div className="flex items-center gap-3.5">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.title}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-800 bg-slate-900 shrink-0 shadow-sm"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-slate-400 shadow-sm">
                              <ImageIcon className="w-5 h-5 text-slate-400 stroke-[1.5]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-white text-sm truncate max-w-sm">
                              {product.title}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {product.product_type || "Standard Product"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-6 text-slate-400 text-xs">
                        {product.vendor || "—"}
                      </td>

                      <td className="py-3 px-6 font-medium text-slate-200 text-sm whitespace-nowrap">
                        {priceDisplay}
                      </td>

                      <td className="py-3 px-6">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${
                            isDraft
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {product.status || "active"}
                        </span>
                      </td>

                      <td className="py-3 px-6 text-slate-300 text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1 rounded-md text-slate-300">
                          <Boxes className="w-3 h-3 text-slate-400" />
                          {variantCount} variant{variantCount === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400 text-xs">
            No products found in the database. Run product sync to populate.
          </div>
        )}
      </div>
    </div>
  );
}
