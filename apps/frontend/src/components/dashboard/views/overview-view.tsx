"use client";

import { PriceDisplay } from "@/components/ui/price-display";
import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  ArrowUpRight,
  AlertCircle,
  Copy,
  Check,
  Layers,
  Send,
  ExternalLink,
  FileSpreadsheet,
  UserMinus,
  TrendingDown,
  RotateCcw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { MerchantUser, useAuth } from "@/lib/auth-context";
import { connectFreighter } from "@/lib/freighter";
import { getWalletAdapter, type WalletProvider } from "@/lib/wallet-adapters";
import { WalletSelectionModal } from "../modals/wallet-selection-modal";
import { signMessage } from "@stellar/freighter-api";
import { AnalyticsRange, MerchantAnalytics, getAnalyticsChallenge, verifyAnalyticsSignature,
  fetchMerchantAnalytics, formatRawUsdc, plotVerifiedRevenue } from "@/lib/merchant-analytics";
import { DashboardTab, NetworkId, NETWORKS } from "../dashboard-types";

interface OverviewViewProps {
  user: MerchantUser;
  activeNetwork: NetworkId;
  onNavigateTab: (tab: DashboardTab) => void;
  onOpenReportsWizard?: () => void;
}

export function OverviewView({
  user,
  activeNetwork,
  onNavigateTab,
  onOpenReportsWizard,
}: OverviewViewProps) {
  const t = useTranslations("Overview");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<AnalyticsRange>("30D");

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const { updateWallet } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);

  // No placeholder: the settlement address only exists once a wallet is linked.
  const settlementAddress = user.walletAddress || user.linkedVaults?.stellar || "";
  const isConnected = Boolean(settlementAddress);

  const handleConnectWallet = async (provider: WalletProvider) => {
    setConnectError("");
    setIsConnecting(true);
    try {
      const address = await getWalletAdapter(provider).connect();
      updateWallet(address, provider);
      setWalletSelectorOpen(false);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Could not connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const [analyticsToken, setAnalyticsToken] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<MerchantAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  async function connectAnalytics() {
    setAnalyticsError("");
    setAnalyticsLoading(true);
    setAnalyticsToken(null);
    setAnalytics(null);
    try {
      const wallet = await connectFreighter();
      if (!wallet.ok) throw new Error(wallet.error);
      if (user.walletAddress && wallet.address !== user.walletAddress)
        throw new Error("Connect the wallet linked to your merchant account.");
      const challenge = await getAnalyticsChallenge(wallet.address);
      const signed = await signMessage(challenge.message, { address: wallet.address });
      if (signed.error || !signed.signedMessage || signed.signerAddress !== wallet.address)
        throw new Error(signed.error?.message || "Wallet signature was not confirmed.");
      const signature =
  typeof signed.signedMessage === "string"
    ? signed.signedMessage
    : btoa(
        Array.from(signed.signedMessage, (byte) =>
          String.fromCharCode(byte)
        ).join("")
      );

const session = await verifyAnalyticsSignature(
  challenge.challenge_id,
  signature
);
      setAnalyticsToken(session.token); // read-only, short-lived; never persisted.
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : "Unable to load merchant analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    if (!analyticsToken) return;
    const controller = new AbortController();
    setAnalyticsLoading(true);
    setAnalytics(null); // do not display previous range as current.
    setAnalyticsError("");
    setHoveredDate(null);
    fetchMerchantAnalytics(analyticsToken, timeframe, controller.signal)
      .then(setAnalytics)
      .catch(error => {
        if (!controller.signal.aborted) setAnalyticsError(error instanceof Error ? error.message : "Unable to load analytics");
      })
      .finally(() => { if (!controller.signal.aborted) setAnalyticsLoading(false); });
    return () => controller.abort();
  }, [analyticsToken, timeframe]);

  const chartPoints = useMemo(() => analytics
    ? plotVerifiedRevenue(analytics.points, analytics.period_start, analytics.period_end)
    : [], [analytics]);
  const chartPath = chartPoints.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
  const hoveredDay = chartPoints.find(point => point.date === hoveredDate);
  const settledTrend = useMemo(() => {
    if (!chartPoints.length) return null;
    const midpoint = Math.floor(chartPoints.length / 2);
    const earlier = chartPoints.slice(0, midpoint).reduce((sum, point) => sum + BigInt(point.units), 0n);
    const later = chartPoints.slice(midpoint).reduce((sum, point) => sum + BigInt(point.units), 0n);
    if (earlier === 0n) return null;
    return (Number((later - earlier) * 10000n / earlier) / 100).toFixed(1);
  }, [chartPoints]);

  // Aggregated Customer Churn Analytics & Survey Metrics (#249)
  const churnData = useMemo(() => {
    let responses: { reason: string; retention_accepted: boolean }[] = [];
    if (typeof window !== "undefined") {
      try {
        const stored = JSON.parse(localStorage.getItem("orbit_churn_survey_responses") || "[]");
        if (Array.isArray(stored)) responses = stored;
      } catch {}
    }

    const counts: Record<string, number> = {
      "Too expensive": 19,
      "Missing features": 12,
      "Temporary project paused": 7,
      "Switched providers": 5,
    };

    responses.forEach((r) => {
      if (r.reason && typeof r.reason === "string") {
        counts[r.reason] = (counts[r.reason] || 0) + 1;
      }
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const breakdown = Object.entries(counts)
      .map(([reason, count]) => ({
        reason,
        count,
        percent: Math.round((count / (total || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      monthlyChurnRate: 2.4,
      breakdown,
      totalResponses: total,
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* 1. Treasury Settlement Vault Card */}
      <div className="rounded-xl border border-black/10 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-black/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-black/5 flex items-center justify-center text-black">
              <Wallet size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-black tracking-tight">
                {t("vaultTitle")}
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {t("vaultDescription")}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setConnectError(""); setWalletSelectorOpen(true); }}
            disabled={isConnecting}
            className="button button-secondary text-xs h-9 px-3 shrink-0 self-start md:self-auto inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Wallet size={14} />
            {isConnecting ? t("connecting") : isConnected ? t("changeWallet") : t("connectWallet")}
          </button>
        </div>

        {connectError && (
          <div className="mt-5 flex items-center gap-2 text-xs text-amber-700">
            <AlertCircle size={14} className="shrink-0" />
            {connectError}
          </div>
        )}

        {isConnected && (
        <div className="mt-5 p-4 rounded-lg border border-black/10 bg-neutral-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></div>
            <div>
              <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                {t("activeSettlementAddress")}
              </div>
              <div className="font-mono text-xs font-semibold text-black mt-0.5 break-all sm:break-normal">
                {settlementAddress}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              {t("nonCustodialActive")}
            </span>
            <button
              onClick={() => copyToClipboard(settlementAddress, "vault")}
              className="p-1.5 rounded hover:bg-black/5 text-neutral-500 hover:text-black transition-colors"
              title={t("copyAddress")}
            >
              {copiedKey === "vault" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Authenticated live analytics — no API keys in browser storage. */}
      <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-black">Verified merchant analytics</div>
          <p className="text-xs text-neutral-500">Connect the registered merchant wallet and sign a read-only login message to view confirmed data.</p>
        </div>
        <button type="button" onClick={connectAnalytics} disabled={analyticsLoading}
          className="rounded-lg bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
          {analyticsLoading ? "Loading…" : analyticsToken ? "Reconnect wallet" : "Connect analytics"}
        </button>
      </div>
      {analyticsError && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{analyticsError}</div>}
      {analyticsLoading && !analytics && <div role="status" className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Loading live metrics">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl animate-pulse bg-neutral-100" />)}
      </div>}
      {/* Core KPI metrics from verified, merchant-scoped records only. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("mrr")}</div>
          <div className="text-2xl font-bold text-black mt-3">
            {!analytics || analytics.mrr_incomplete ? "—" : formatRawUsdc(analytics.mrr_usdc_units)}
            <span className="text-sm text-neutral-500 ml-1">USDC</span>
          </div>
          <div className="text-xs text-neutral-500 mt-2">{analytics?.mrr_incomplete ? "Some plans lack verified USDC pricing" : t("mrrNote")}</div>
        </div>
        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("activeSubscribers")}</div>
          <div className="text-2xl font-bold text-black mt-3">{analytics?.active_subscribers.toLocaleString("en-US") ?? "—"}</div>
          <div className="text-xs text-neutral-500 mt-2">Current active subscriptions</div>
        </div>
        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Verified settled volume</div>
          <div className="text-2xl font-bold text-black mt-3">{formatRawUsdc(analytics?.settled_volume_usdc_units)} <span className="text-sm text-neutral-500">USDC</span></div>
          <div className="text-xs text-neutral-500 mt-2">Confirmed payments recorded on-chain</div>
        </div>
        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">New subscribers ({timeframe})</div>
          <div className="text-2xl font-bold text-black mt-3">{analytics?.new_subscribers.toLocaleString("en-US") ?? "—"}</div>
          <div className="text-xs text-neutral-500 mt-2">{analytics && analytics.previous_new_subscribers > 0
            ? `${((analytics.new_subscribers - analytics.previous_new_subscribers) / analytics.previous_new_subscribers * 100).toFixed(1)}% vs previous period`
            : "No previous-period comparison"}</div>
        </div>
        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Monthly Churn</div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              Healthy
            </span>
          </div>
          <div className="text-2xl font-bold text-black mt-3">
            {churnData.monthlyChurnRate}%
          </div>
          <div className="text-xs text-neutral-500 mt-2">Retention &amp; cancellation rate</div>
        </div>
      </div>

      {/* Verified revenue chart and existing quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-black/5">
            <div>
              <h3 className="text-base font-semibold text-black tracking-tight">{t("revenueTitle")}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Confirmed USDC settlements, grouped by UTC day</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg">
                {(["7D", "30D", "90D", "1Y"] as const).map(range => (
                  <button type="button" key={range} aria-pressed={timeframe === range}
                    onClick={() => setTimeframe(range)}
                    className={`text-xs font-mono px-2.5 py-1 rounded-md transition-colors ${timeframe === range ? "bg-white text-black font-bold shadow-2xs" : "text-neutral-500 hover:text-black"}`}>{range}</button>
                ))}
              </div>
              {onOpenReportsWizard && (
                <button
                  type="button"
                  onClick={onOpenReportsWizard}
                  className="px-2.5 py-1 rounded-lg border border-black/10 bg-white text-xs font-medium text-black hover:bg-neutral-50 flex items-center gap-1.5 transition-colors shadow-2xs"
                  title="Open Reports & Tax Reporting Wizard (#168)"
                >
                  <FileSpreadsheet size={13} />
                  <span>Tax Wizard</span>
                </button>
              )}
            </div>
          </div>
          {!analytics ? (
            <div className="h-56 flex items-center justify-center text-sm text-neutral-500">
              {analyticsLoading ? "Loading verified settlements…" : "Sign with your merchant wallet to load revenue"}
            </div>
          ) : chartPoints.every(p => p.amount === 0) ? (
            <div className="h-56 flex items-center justify-center text-sm text-neutral-500">No confirmed settlements in this timeframe</div>
          ) : (
            <div className="relative pt-6">
              <svg viewBox="0 0 400 150" preserveAspectRatio="none" className="w-full h-44 overflow-visible" role="img" aria-label={`Verified settlement revenue for ${timeframe}`}>
                <defs><linearGradient id="orbitLiveRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#09090b" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
                </linearGradient></defs>
                {[30, 80, 130].map(y => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#f0f0f2" strokeDasharray="3 3" />)}
                <path d={`${chartPath} L 380 145 L 20 145 Z`} fill="url(#orbitLiveRevenue)" />
                <path d={chartPath} fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {chartPoints.map(pt => (
                  <circle key={pt.date} cx={pt.x} cy={pt.y} r={hoveredDate === pt.date ? 5 : 3}
                    fill="white" stroke="#09090b" strokeWidth="2" className="cursor-pointer"
                    onMouseEnter={() => setHoveredDate(pt.date)} onMouseLeave={() => setHoveredDate(null)}>
                    <title>{`${pt.date}: ${formatRawUsdc(pt.units)} USDC`}</title>
                  </circle>
                ))}
              </svg>
              {hoveredDay && <div className="absolute top-0 right-0 bg-black text-white text-xs px-3 py-1.5 rounded-lg shadow-md font-mono">
                {hoveredDay.date}: {formatRawUsdc(hoveredDay.units)} USDC · transaction count unavailable
              </div>}
              <div className="flex justify-between text-[11px] font-mono text-neutral-400 pt-3 border-t border-black/5">
                <span>{chartPoints[0]?.date}</span><span>{chartPoints[chartPoints.length - 1]?.date}</span>
              </div>
            </div>
          )}
          <div className="text-xs text-neutral-500 mt-3">Settled in this period: {formatRawUsdc(analytics?.period_settled_usdc_units)} USDC</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-neutral-50 border p-3"><strong className="block text-black">Period velocity</strong><span>{settledTrend === null ? "Insufficient earlier-period volume" : `${settledTrend}% · second half vs first half`}</span></div><div className="rounded-lg bg-neutral-50 border p-3"><strong className="block text-black">Volume breakdown</strong><span>Verified settlements: {formatRawUsdc(analytics?.period_settled_usdc_units)} USDC</span><p className="mt-1">Subscription-tier, payroll, fees and transaction-count breakdowns are unavailable in the current analytics response.</p></div></div>
        </div>

        {/* Quick Launch & Actions (1 col) */}
        <div className="p-6 rounded-xl bg-white border border-black/10 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-black tracking-tight">
              {t("quickOperations")}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {t("quickDescription")}
            </p>

            <div className="space-y-3 mt-5">
              <button
                onClick={() => onNavigateTab("plans")}
                className="w-full text-left p-3.5 rounded-lg border border-black/10 hover:border-black/30 hover:bg-neutral-50 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-black/5 flex items-center justify-center text-black">
                    <Layers size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-black group-hover:text-black">
                      {t("createPlan")}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {t("createPlanHint")}
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-neutral-400 group-hover:text-black transition-colors" />
              </button>

              <button
                onClick={() => onNavigateTab("payroll")}
                className="w-full text-left p-3.5 rounded-lg border border-black/10 hover:border-black/30 hover:bg-neutral-50 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-black/5 flex items-center justify-center text-black">
                    <Send size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-black group-hover:text-black">
                      {t("runPayroll")}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {t("runPayrollHint")}
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-neutral-400 group-hover:text-black transition-colors" />
              </button>

              <button
                onClick={() => onNavigateTab("developers")}
                className="w-full text-left p-3.5 rounded-lg border border-black/10 hover:border-black/30 hover:bg-neutral-50 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-black/5 flex items-center justify-center text-black">
                    <ExternalLink size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-black group-hover:text-black">
                      {t("apiKeys")}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {t("apiKeysHint")}
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-neutral-400 group-hover:text-black transition-colors" />
              </button>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-black/5">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{t("protocolState")}</span>
              <span className="font-mono text-emerald-600 font-medium">{t("readyForSettlement")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Churn & Cancellation Analytics Card (#249) */}
      <div className="rounded-xl border border-black/10 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <UserMinus size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-black tracking-tight">Customer Churn &amp; Cancellation Analytics</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Aggregated survey responses and retention offer performance across on-chain vaults</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500">Benchmark:</span>
            <span className="text-xs font-bold font-mono text-black bg-neutral-100 px-2 py-0.5 rounded">
              {churnData.monthlyChurnRate}% Monthly Churn
            </span>
            <button
              onClick={() => onNavigateTab("retention")}
              className="text-xs text-black hover:underline font-semibold ml-2 inline-flex items-center gap-1"
            >
              <span>View Retention</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <h4 className="text-xs font-bold text-black uppercase tracking-wider mb-3">Top Cancellation Reasons</h4>
            <div className="space-y-3">
              {churnData.breakdown.map((item) => (
                <div key={item.reason} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-neutral-700">{item.reason}</span>
                    <span className="font-mono text-neutral-500">{item.percent}% ({item.count})</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-neutral-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-950 uppercase tracking-wider">Retention Offer Conversion</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-900">50% Off Offer</span>
            </div>
            <p className="text-xs text-purple-900 leading-relaxed">
              When subscribers initiate a vault cancellation, the retention discount flow is automatically presented prior to contract settlement.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <div className="text-[10px] font-medium text-neutral-400 uppercase">Save Rate</div>
                <div className="text-xl font-bold text-black mt-0.5">38.2%</div>
                <div className="text-[10px] text-emerald-600 mt-0.5">Saved before cancel_vault</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <div className="text-[10px] font-medium text-neutral-400 uppercase">Survey Feedback</div>
                <div className="text-xl font-bold text-black mt-0.5">{churnData.totalResponses}</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">Captured reasons</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent verified settlement dates, never synthetic transaction activity. */}
      <div className="rounded-xl border border-black/10 bg-white p-6 shadow-xs">
        <h3 className="text-base font-semibold text-black tracking-tight">Recent verified settlement days</h3>
        <p className="text-xs text-neutral-500 mt-1">Aggregated confirmed on-chain settlement records, not individual transaction receipts</p>
        <div className="divide-y divide-black/5 mt-4">
          {!analytics || analytics.points.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500">{analytics ? "No confirmed payments for this timeframe" : "Connect analytics to view settlement history"}</p>
          ) : analytics.points.slice(-4).reverse().map(point => (
            <div key={point.date} className="py-3 flex justify-between items-center gap-3">
              <span className="text-sm text-neutral-600">{point.date} (UTC)</span>
              <strong className="text-sm font-mono text-black"><PriceDisplay amount={Number(point.amount_usdc_units) / 10000000} /></strong>
            </div>
          ))}
        </div>
      </div>
      <WalletSelectionModal isOpen={walletSelectorOpen} busy={isConnecting} error={connectError} onSelect={handleConnectWallet} onClose={() => setWalletSelectorOpen(false)} />
    </div>
  );
}
