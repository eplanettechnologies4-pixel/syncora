"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Calendar,
  Sparkles,
  Package,
  Activity,
  Layers,
  BarChart3,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface OrderRecord {
  id: string;
  total_price: number | string | null;
  created_at: string;
  financial_status?: string | null;
}

interface TopProduct {
  id: string;
  title: string;
  imageUrl?: string | null;
  quantity: number;
  revenue: number;
}

interface DayData {
  key: string;
  label: string;
  fullDate: string;
  revenue: number;
  ordersCount: number;
}

function formatCurrency(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

export default function AnalyticsOverview() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingTopProducts, setLoadingTopProducts] = useState(true);
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [pulseHighlight, setPulseHighlight] = useState(false);
  const [lastLiveOrderNumber, setLastLiveOrderNumber] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Fetch all orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_price, created_at, financial_status")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setOrders(
          data.map((o: any) => ({
            id: o.id,
            total_price:
              typeof o.total_price === "number"
                ? o.total_price
                : parseFloat(o.total_price || "0"),
            created_at: o.created_at,
            financial_status: o.financial_status,
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching orders for analytics:", err);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // 2. Fetch Top 5 Products
  const fetchTopProducts = useCallback(async () => {
    try {
      setLoadingTopProducts(true);
      const { data, error } = await supabase
        .from("order_line_items")
        .select(`
          quantity,
          price,
          product_variants (
            id,
            title,
            products (
              id,
              title,
              image_url
            )
          )
        `);

      if (!error && data) {
        const productMap: Record<string, TopProduct> = {};

        for (const item of data as any[]) {
          const prod = item.product_variants?.products;
          const prodId = prod?.id || item.product_variants?.id || "unknown";
          const title = prod?.title || "Unknown Product";
          const imageUrl = prod?.image_url || null;
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;

          if (!productMap[prodId]) {
            productMap[prodId] = {
              id: prodId,
              title,
              imageUrl,
              quantity: 0,
              revenue: 0,
            };
          }
          productMap[prodId].quantity += qty;
          productMap[prodId].revenue += qty * price;
        }

        const sorted = Object.values(productMap)
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        setTopProducts(sorted);
      }
    } catch (err) {
      console.error("Error fetching top products:", err);
    } finally {
      setLoadingTopProducts(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchOrders();
    fetchTopProducts();
  }, [fetchOrders, fetchTopProducts]);

  // 3. Supabase Realtime Subscription on "orders" table (INSERT events)
  useEffect(() => {
    const channel = supabase
      .channel("realtime-analytics-overview")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const raw = payload.new as any;
          const newOrder: OrderRecord = {
            id: raw.id,
            total_price:
              typeof raw.total_price === "number"
                ? raw.total_price
                : parseFloat(raw.total_price || "0"),
            created_at: raw.created_at,
            financial_status: raw.financial_status,
          };

          // Flash pulse effect across stat cards
          setPulseHighlight(true);
          const orderIdentifier = raw.order_number || `#${raw.shopify_order_id || ""}`;
          setLastLiveOrderNumber(orderIdentifier);

          const timer = setTimeout(() => {
            setPulseHighlight(false);
          }, 3000);

          // Update local orders list live without page reload
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });

          // Refresh Top Products
          fetchTopProducts();

          return () => clearTimeout(timer);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTopProducts]);

  // Calculations for 4 Stat Cards
  const { totalRevenue, revenueToday, ordersToday, aov } = useMemo(() => {
    const todayStr = new Date().toDateString();

    let totRev = 0;
    let revToday = 0;
    let ordToday = 0;

    for (const o of orders) {
      const price = Number(o.total_price) || 0;
      totRev += price;

      const orderDate = new Date(o.created_at);
      if (!isNaN(orderDate.getTime()) && orderDate.toDateString() === todayStr) {
        revToday += price;
        ordToday += 1;
      }
    }

    const calculatedAov = orders.length > 0 ? totRev / orders.length : 0;

    return {
      totalRevenue: totRev,
      revenueToday: revToday,
      ordersToday: ordToday,
      aov: calculatedAov,
    };
  }, [orders]);

  // 14-Day Daily Revenue Data Generation
  const chartData: DayData[] = useMemo(() => {
    const days: DayData[] = [];
    const now = new Date();

    // Generate last 14 days chronologically (13 days ago -> today)
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0]; // YYYY-MM-DD
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const fullDate = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      days.push({
        key,
        label,
        fullDate,
        revenue: 0,
        ordersCount: 0,
      });
    }

    const dayMap = new Map<string, DayData>();
    for (const day of days) {
      dayMap.set(day.key, day);
    }

    for (const o of orders) {
      try {
        const oDate = new Date(o.created_at);
        if (isNaN(oDate.getTime())) continue;
        const oKey = oDate.toISOString().split("T")[0];
        const dayEntry = dayMap.get(oKey);
        if (dayEntry) {
          dayEntry.revenue += Number(o.total_price) || 0;
          dayEntry.ordersCount += 1;
        }
      } catch {
        // ignore date parse errors
      }
    }

    return days;
  }, [orders]);

  // Max revenue in chart for YAxis scaling
  const maxRevenue = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => d.revenue), 0);
    return maxVal > 0 ? Math.ceil(maxVal * 1.15) : 1000;
  }, [chartData]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const point: DayData = payload[0].payload;
      return (
        <div className="bg-[#0c1220]/95 border border-slate-700/90 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs min-w-[160px]">
          <p className="text-[11px] font-semibold text-slate-400 mb-1">{point.fullDate}</p>
          <div className="flex items-center justify-between gap-3 my-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              Revenue:
            </span>
            <span className="font-bold font-mono text-emerald-400 text-sm">
              {formatCurrency(point.revenue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-400 text-[11px] pt-1 border-t border-slate-800">
            <span>Orders:</span>
            <span className="font-semibold text-slate-200">{point.ordersCount}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const statCards = [
    {
      id: "total_revenue",
      title: "Total Revenue",
      value: formatCurrency(totalRevenue),
      subtext: `${orders.length} orders all-time`,
      icon: DollarSign,
      color: "emerald",
    },
    {
      id: "revenue_today",
      title: "Revenue Today",
      value: formatCurrency(revenueToday),
      subtext: `${ordersToday} ${ordersToday === 1 ? "order" : "orders"} placed today`,
      icon: Calendar,
      color: "teal",
    },
    {
      id: "orders_today",
      title: "Orders Today",
      value: ordersToday.toLocaleString("en-US"),
      subtext: "Live incoming count",
      icon: ShoppingBag,
      color: "cyan",
    },
    {
      id: "aov",
      title: "Average Order Value",
      value: formatCurrency(aov),
      subtext: "Per order average",
      icon: TrendingUp,
      color: "emerald",
    },
  ];

  return (
    <section className="space-y-6">
      {/* Section Header with Live indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Performance Analytics
              {lastLiveOrderNumber && pulseHighlight && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  <Sparkles className="w-3 h-3" />
                  New: {lastLiveOrderNumber}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Live automated sales stats, 14-day daily trends &amp; product performance
            </p>
          </div>
        </div>

        {/* Realtime Status Indicator */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-medium text-slate-300">Supabase Realtime</span>
          </div>
        </div>
      </div>

      {/* 1. Four Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                pulseHighlight
                  ? "bg-emerald-950/30 border-emerald-500/60 shadow-xl shadow-emerald-950/40 ring-2 ring-emerald-500/40 scale-[1.01]"
                  : "bg-[#0c1220]/75 border-slate-800/80 hover:border-slate-700/80 hover:bg-[#0c1220]"
              }`}
            >
              {/* Subtle top ambient glow */}
              <div className="absolute -top-10 -right-10 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {card.title}
                </span>
                <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-emerald-400 shadow-sm">
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="text-2xl font-extrabold text-white font-mono tracking-tight">
                {loadingOrders ? (
                  <div className="h-7 w-28 bg-slate-800/70 animate-pulse rounded-md" />
                ) : (
                  card.value
                )}
              </div>

              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="text-slate-400">{card.subtext}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. 14-Day Daily Revenue Chart */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/75 backdrop-blur-sm overflow-hidden shadow-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h4 className="text-base font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Daily Revenue (Last 14 Days)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregated daily order gross from Shopify &amp; Supabase
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setChartType("area")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
                  chartType === "area"
                    ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <LineChartIcon className="w-3.5 h-3.5" />
                <span>Area</span>
              </button>
              <button
                type="button"
                onClick={() => setChartType("bar")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
                  chartType === "bar"
                    ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Bar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Recharts Container */}
        <div className="h-64 w-full pt-2">
          {!isMounted || loadingOrders ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading chart data...</span>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "area" ? (
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#1e293b" }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#1e293b" }}
                    tickFormatter={(val) =>
                      val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                    }
                    domain={[0, maxRevenue]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#revenueGradient)"
                    activeDot={{ r: 5, fill: "#34d399", stroke: "#064e3b", strokeWidth: 2 }}
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#1e293b" }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#1e293b" }}
                    tickFormatter={(val) =>
                      val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                    }
                    domain={[0, maxRevenue]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="revenue"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 3. Top 5 Products Ranked List */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#0c1220]/75 backdrop-blur-sm overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h4 className="text-base font-semibold text-white">Top 5 Products</h4>
            <span className="text-xs text-slate-400 ml-1">by units sold</span>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Source: <span className="text-emerald-400">order_line_items</span>
          </div>
        </div>

        <div className="p-6">
          {loadingTopProducts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((prod, idx) => {
                const rank = idx + 1;
                const rankBadgeColors = [
                  "bg-amber-400/15 text-amber-300 border-amber-400/30",
                  "bg-slate-300/15 text-slate-200 border-slate-300/30",
                  "bg-amber-600/15 text-amber-500 border-amber-600/30",
                  "bg-slate-800 text-slate-400 border-slate-700/50",
                  "bg-slate-800 text-slate-400 border-slate-700/50",
                ];

                return (
                  <div
                    key={prod.id || idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/80 transition-all duration-150"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Rank Number Badge */}
                      <span
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${
                          rankBadgeColors[idx] || "bg-slate-800 text-slate-400"
                        }`}
                      >
                        #{rank}
                      </span>

                      {/* Product Thumbnail or Fallback Icon */}
                      {prod.imageUrl ? (
                        <img
                          src={prod.imageUrl}
                          alt={prod.title}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-800 bg-slate-950 shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0 text-slate-400">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}

                      {/* Product Title */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate max-w-sm sm:max-w-md">
                          {prod.title}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Total Revenue:{" "}
                          <span className="font-mono text-emerald-400 font-medium">
                            {formatCurrency(prod.revenue)}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Quantity Sold Metric */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-10 sm:pl-0">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 uppercase font-medium">
                          Sold
                        </span>
                        <div className="text-sm font-bold text-white font-mono">
                          {prod.quantity.toLocaleString("en-US")} units
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              No product sales data found in order line items.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
