"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Wallet,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Lock,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { connectFreighter } from "@/lib/freighter";

interface HostedPlanData {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  type: "recurring" | "one_time";
  intervalDays?: number;
  merchantName: string;
  merchantAddress: string;
}

const KNOWN_LINKS: Record<string, HostedPlanData> = {
  plink_retainer_94a: {
    id: "plink_retainer_94a",
    title: "Monthly Advisory Retainer",
    description: "Full strategic guidance, smart contract audits, and priority developer access.",
    amount: 2000.0,
    currency: "USDC",
    type: "recurring",
    intervalDays: 30,
    merchantName: "Drips Labs",
    merchantAddress: "GDQP...4N2K",
  },
  plink_community_81b: {
    id: "plink_community_81b",
    title: "Private DAO Member Pass",
    description: "Exclusive access to private governance research channels and weekly alpha calls.",
    amount: 100.0,
    currency: "USDC",
    type: "recurring",
    intervalDays: 30,
    merchantName: "Drips Labs",
    merchantAddress: "GDQP...4N2K",
  },
  plink_audit_42c: {
    id: "plink_audit_42c",
    title: "Architecture Audit & Review",
    description: "Comprehensive code verification and gas optimization report.",
    amount: 1500.0,
    currency: "USDC",
    type: "one_time",
    merchantName: "Drips Labs",
    merchantAddress: "GDQP...4N2K",
  },
  plan_monthly_pro: {
    id: "plan_monthly_pro",
    title: "Pro Developer Membership",
    description: "Unlimited Soroban pull pipelines, real-time webhooks, and 100k API credits.",
    amount: 49.0,
    currency: "USDC",
    type: "recurring",
    intervalDays: 30,
    merchantName: "Drips Labs",
    merchantAddress: "GDQP...4N2K",
  },
};

export default function HostedCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const linkId = resolvedParams.id;

  const [linkData, setLinkData] = useState<HostedPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerAddress, setCustomerAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  useEffect(() => {
    // Check if known link, otherwise generate fallback clean plan
    if (KNOWN_LINKS[linkId]) {
      // Check if user has saved a custom business name in localStorage
      let savedBusinessName = "Drips Labs";
      try {
        const storedAuth = localStorage.getItem("orbit_mock_user");
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          if (parsed.businessName) savedBusinessName = parsed.businessName;
        }
      } catch (e) {
        // ignore
      }

      setLinkData({
        ...KNOWN_LINKS[linkId],
        merchantName: savedBusinessName,
      });
    } else {
      setLinkData({
        id: linkId,
        title: "Orbit Checkout Settlement",
        description: "Non-custodial payment authorization on Stellar Soroban.",
        amount: 50.0,
        currency: "USDC",
        type: "recurring",
        intervalDays: 30,
        merchantName: "Orbit Merchant",
        merchantAddress: "GA4B...78KL",
      });
    }
    setLoading(false);
  }, [linkId]);

  const handleConnectWallet = async () => {
    setWalletError(null);
    const result = await connectFreighter();

    if (result.ok) {
      setCustomerAddress(result.address);
    } else {
      setWalletError(result.error);
    }
  };

  const handleAuthorizeCheckout = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsCompleted(true);
      setTxHash("6f4a8b92c103e5fd8a9942a1b7e36c0d8924f115ab37d402");
    }, 1400);
  };

  const copyHash = () => {
    if (txHash) {
      navigator.clipboard.writeText(txHash);
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafb] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!linkData) return null;

  return (
    <div className="min-h-screen bg-[#fafafb] flex flex-col justify-between text-[#09090b]">
      {/* Top Banner */}
      <header className="h-16 px-6 sm:px-12 border-b border-black/10 bg-white flex items-center justify-between">
        <Brand variant="black" />
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-600 bg-neutral-100 px-3 py-1 rounded-full border border-black/5">
          <Lock size={12} className="text-emerald-600" />
          <span>Soroban Verified Rail</span>
        </div>
      </header>

      {/* Main Checkout Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg bg-white border border-black/10 rounded-2xl shadow-xl overflow-hidden">
          {/* Merchant Bar */}
          <div className="p-6 bg-neutral-50/70 border-b border-black/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                Merchant
              </div>
              <div className="text-sm font-bold text-black mt-0.5">
                {linkData.merchantName}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                Settlement
              </div>
              <div className="text-xs font-mono font-medium text-neutral-700 mt-0.5">
                Stellar Testnet USDC
              </div>
            </div>
          </div>

          {!isCompleted ? (
            <div className="p-6 sm:p-8 space-y-6">
              {/* Product Info */}
              <div>
                <h2 className="text-xl font-bold text-black tracking-tight">
                  {linkData.title}
                </h2>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  {linkData.description}
                </p>
                <div className="mt-4 pt-4 border-t border-black/5 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase text-neutral-500">
                    {linkData.type === "recurring" ? "Recurring Subscription" : "One-Time Payment"}
                  </span>
                  <div className="text-3xl font-extrabold text-black font-mono">
                    ${linkData.amount.toFixed(2)}
                    <span className="text-xs font-medium text-neutral-500 ml-1.5 font-sans">
                      USDC {linkData.type === "recurring" ? `/ ${linkData.intervalDays} days` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Protocol Assurance Notice */}
              <div className="p-4 rounded-xl bg-neutral-50 border border-black/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-black">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <span>Non-Custodial Pull Allowance</span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Your funds remain securely in your wallet. By approving, you grant {linkData.merchantName}{" "}
                  permission to pull exactly ${linkData.amount.toFixed(2)} USDC on interval. You retain 100% control
                  to pause or revoke this allowance at any moment.
                </p>
              </div>

              {/* Step 1: Connect Wallet */}
              {!customerAddress ? (
                <div className="space-y-3">
                  <button
                    onClick={handleConnectWallet}
                    className="w-full button button-primary h-12 text-sm flex items-center justify-center gap-2 font-bold"
                  >
                    <Wallet size={16} />
                    <span>Connect Freighter Wallet</span>
                  </button>
                  <p className="text-[11px] text-center text-neutral-400">
                    Connect your Freighter wallet to continue
                  </p>
                  {walletError && (
                    <p
                      role="alert"
                      className="text-[11px] text-center text-red-600"
                    >
                      {walletError}
                    </p>
                  )}
                </div>
              ) : (
                /* Step 2: Authorize Allowance */
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-100/70 border border-black/5 text-xs">
                    <span className="text-neutral-500">Connected Wallet:</span>
                    <span className="font-mono font-medium text-black">
                      {customerAddress.slice(0, 6)}...{customerAddress.slice(-4)}
                    </span>
                  </div>

                  <button
                    onClick={handleAuthorizeCheckout}
                    disabled={isProcessing}
                    className="w-full button button-primary h-12 text-sm flex items-center justify-center gap-2 font-bold"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Signing Soroban Allowance...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Authorize &amp; Activate Vault</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Step 3: Success Screen */
            <div className="p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-black tracking-tight">
                  Authorization Confirmed!
                </h3>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1.5 leading-relaxed">
                  Your recurring allowance vault is active on Stellar Testnet for{" "}
                  <strong className="text-black">{linkData.merchantName}</strong>.
                </p>
              </div>

              {/* Receipt Box */}
              <div className="p-4 rounded-xl border border-black/10 bg-neutral-50 text-left text-xs space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Plan:</span>
                  <span className="font-bold text-black">{linkData.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Approved Cap:</span>
                  <span className="font-mono font-bold text-black">${linkData.amount.toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Cadence:</span>
                  <span className="font-mono text-neutral-700">Every {linkData.intervalDays} Days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Vault Contract:</span>
                  <span className="font-mono text-emerald-700 font-bold">CAZBZB...YQNG</span>
                </div>
                <div className="pt-2 border-t border-black/10 flex items-center justify-between">
                  <span className="text-neutral-500">Ledger Tx:</span>
                  <button
                    onClick={copyHash}
                    className="font-mono text-[11px] text-neutral-700 hover:text-black flex items-center gap-1"
                  >
                    <span>{txHash?.slice(0, 8)}...{txHash?.slice(-6)}</span>
                    {copiedTx ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  href="/dashboard"
                  className="button button-primary text-xs h-10 px-5 flex items-center justify-center gap-1.5"
                >
                  <span>Return to Merchant Dashboard</span>
                  <ArrowRight size={14} />
                </Link>
                <button
                  onClick={() => setIsCompleted(false)}
                  className="button button-secondary text-xs h-10 px-4"
                >
                  Test Another Checkout
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-neutral-400 border-t border-black/5 bg-white">
        <div className="flex items-center justify-center gap-2">
          <span>Powered by</span>
          <Brand variant="black" />
          <span>• Non-Custodial Stellar Rails</span>
        </div>
      </footer>
    </div>
  );
}
