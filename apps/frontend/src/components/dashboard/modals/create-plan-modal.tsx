"use client";

import { useState } from "react";
import { X, Check, Copy, Package, Sparkles, Code2, ArrowRight } from "lucide-react";
import { SubscriptionPlan } from "../dashboard-types";

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePlan: (plan: SubscriptionPlan) => void;
}

export function CreatePlanModal({ isOpen, onClose, onCreatePlan }: CreatePlanModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [currency, setCurrency] = useState<"USDC" | "EURC">("USDC");
  const [billingModel, setBillingModel] = useState<"fixed" | "tiered" | "metered">("fixed");
  const [trialDays, setTrialDays] = useState("0");
  const [graceDays, setGraceDays] = useState("0");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("29");
  const [intervalDays, setIntervalDays] = useState("30");
  const [description, setDescription] = useState("");
  const [createdPlan, setCreatedPlan] = useState<SubscriptionPlan | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0.1 || ![7,30,90,365].includes(Number(intervalDays))) return;

    const newPlanId = `plan_${name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 12)}_${crypto.randomUUID().slice(0, 8)}`;
    const newPlan: SubscriptionPlan = {
      id: newPlanId,
      name: name.trim(),
      amount: parseFloat(amount) || 29,
      currency,
      intervalDays: parseInt(intervalDays, 10) || 30,
      network: "stellar-testnet",
      activeSubscribers: 0,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    onCreatePlan(newPlan);
    setCreatedPlan(newPlan);
    setStep(5);
  };

  const resetAndClose = () => {
    setStep(1);
    setCurrency("USDC");
    setBillingModel("fixed");
    setTrialDays("0");
    setGraceDays("0");
    setName("");
    setAmount("29");
    setIntervalDays("30");
    setDescription("");
    setCreatedPlan(null);
    setCopiedSnippet(false);
    onClose();
  };

  const getReactSnippet = (planId: string) => {
    return `import { OrbitCheckout } from "@orbit/checkout";

export default function CheckoutButton() {
  return (
    <OrbitCheckout
      planId="${planId}"
      onSuccess={({ user, vault }) => {
        console.log("Recurring allowance approved on Stellar:", vault);
      }}
    />
  );
}`;
  };

  const copySnippet = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl bg-white border border-black/10 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center text-black">
              <Package size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-black tracking-tight">
                {step === 5 ? "Plan Created Successfully" : "Create Subscription Plan"}
              </h3>
              <p className="text-xs text-neutral-500">
                {step === 1
                  ? "Define recurring USDC allowance parameters on Stellar Soroban."
                  : "Copy the drop-in checkout snippet to embed on your website."}
              </p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Plan Details Form */}
        {step === 1 && (
          <form onSubmit={handleCreate} className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1.5">
                Plan Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. MailKit Pro, AI Engine Starter, DAO Member"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3.5 py-2.5 text-xs text-black focus:outline-hidden focus:ring-1 focus:ring-black focus:border-black"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1.5">
                  Billing Amount (USDC)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-black/10 pl-3.5 pr-16 py-2.5 text-xs font-mono text-black focus:outline-hidden focus:ring-1 focus:ring-black focus:border-black"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-neutral-400">
                    USDC
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1.5">
                  Billing Cycle
                </label>
                <select
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(e.target.value)}
                  className="w-full rounded-lg border border-black/10 px-3.5 py-2.5 text-xs text-black bg-white focus:outline-hidden focus:ring-1 focus:ring-black focus:border-black"
                >
                  <option value="7">Every 7 Days (Weekly)</option>
                  <option value="30">Every 30 Days (Monthly)</option>
                  <option value="90">Every 90 Days (Quarterly)</option>
                  <option value="365">Every 365 Days (Annual)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1.5">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Includes unlimited API calls, verified badge, and priority support"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3.5 py-2.5 text-xs text-black focus:outline-hidden focus:ring-1 focus:ring-black focus:border-black"
              />
            </div>

            <div className="p-3.5 rounded-lg bg-neutral-50 border border-black/5 text-xs text-neutral-600 flex items-start gap-2.5">
              <Sparkles size={16} className="text-black shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-black">Non-custodial pull enforcement:</span>
                {" "}Subscribers sign an on-chain allowance vault on Stellar Soroban that authorizes exactly {amount || "29"} USDC per {intervalDays} days.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10">
              <button
                type="button"
                onClick={resetAndClose}
                className="button button-secondary text-xs h-9 px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!name.trim() || !(Number(amount) > 0.1)}
                onClick={() => setStep(2)}
                className="button button-primary text-xs h-9 px-4 flex items-center gap-1.5"
              >
                <span>Next: Billing Model</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </form>
        )}

        {step >= 1 && step <= 4 && <div className="px-6 pb-2 text-xs text-neutral-500">Step {step} of 4 · {["Basics", "Billing model", "Trial and grace", "Review"][step - 1]}</div>}
        {step === 2 && <div className="p-6 space-y-4"><h4 className="font-semibold text-sm">Billing model</h4><label className="block text-xs">Currency <select className="block w-full border rounded p-2 mt-1" value={currency} onChange={e => setCurrency(e.target.value as "USDC" | "EURC")}><option>USDC</option><option>EURC</option></select></label><label className="block text-xs">Pricing <select className="block w-full border rounded p-2 mt-1" value={billingModel} onChange={e => setBillingModel(e.target.value as typeof billingModel)}><option value="fixed">Fixed recurring</option><option value="tiered">Tiered volume (preview only)</option><option value="metered">Base fee + metered usage (preview only)</option></select></label>{billingModel !== "fixed" && <p role="status" className="text-xs text-amber-700">The current plan API supports fixed recurring amounts only. Advanced billing cannot be deployed until the backend supports it.</p>}<div className="flex justify-between"><button onClick={() => setStep(1)} className="button button-secondary px-4 py-2 text-xs">Back</button><button onClick={() => setStep(3)} className="button button-primary px-4 py-2 text-xs">Next</button></div></div>}
        {step === 3 && <div className="p-6 space-y-4"><h4 className="font-semibold text-sm">Trial &amp; grace periods</h4>{[["Trial days",trialDays,setTrialDays],["Grace period days",graceDays,setGraceDays]] .map(([label,value,setter]) => <label key={label as string} className="block text-xs">{label as string}<input type="number" min="0" max="365" value={value as string} onChange={e => (setter as (value:string)=>void)(e.target.value)} className="block w-full border rounded p-2 mt-1" /></label>)}<div className="flex justify-between"><button onClick={() => setStep(2)} className="button button-secondary px-4 py-2 text-xs">Back</button><button disabled={[trialDays,graceDays].some(v => !/^\d+$/.test(v) || Number(v) > 365)} onClick={() => setStep(4)} className="button button-primary px-4 py-2 text-xs">Review</button></div></div>}
        {step === 4 && <div className="p-6 space-y-4"><h4 className="font-semibold text-sm">Checkout preview</h4><div className="rounded-xl border p-4 space-y-2"><p className="font-bold">{name}</p><p className="text-xs">{description}</p><p className="text-xl font-bold">{amount} {currency} / {intervalDays} days</p><p className="text-xs text-neutral-500">{billingModel} · {trialDays} trial days · {graceDays} grace days</p></div><p className="text-xs text-amber-700">Only fixed recurring pricing is supported by the current backend. Trial and grace settings are preview-only.</p><div className="flex justify-between"><button onClick={() => setStep(3)} className="button button-secondary px-4 py-2 text-xs">Back</button><button disabled={billingModel !== "fixed" || currency !== "USDC" || Number(trialDays) !== 0 || Number(graceDays) !== 0} onClick={() => handleCreate({preventDefault: () => {}} as React.FormEvent)} className="button button-primary px-4 py-2 text-xs">Create supported plan</button></div></div>}
        {/* Step 5: Code Snippet Drawer */}
        {step === 5 && createdPlan && (
          <div className="p-6 space-y-5">
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
              <div>
                <span className="font-semibold">{createdPlan.name}</span> is live!
                <div className="font-mono text-[11px] text-emerald-700 mt-0.5">
                  ID: {createdPlan.id} · {createdPlan.amount} USDC / {createdPlan.intervalDays} Days
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">
                READY
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-black uppercase tracking-wider flex items-center gap-1.5">
                  <Code2 size={14} />
                  Drop-in React SDK Component
                </label>
                <button
                  onClick={() => copySnippet(getReactSnippet(createdPlan.id))}
                  className="button button-secondary text-xs h-7 px-2.5 flex items-center gap-1"
                >
                  {copiedSnippet ? (
                    <>
                      <Check size={12} className="text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-lg bg-[#09090b] text-neutral-200 p-4 font-mono text-xs overflow-x-auto border border-neutral-800">
                <pre className="leading-relaxed">
                  <code>{getReactSnippet(createdPlan.id)}</code>
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10">
              <button
                type="button"
                onClick={resetAndClose}
                className="button button-primary text-xs h-9 px-5"
              >
                Done &amp; View Plans Table
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
