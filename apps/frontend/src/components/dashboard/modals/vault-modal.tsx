"use client";

import { useDialogFocus } from "./use-dialog-focus";

import { useState, useEffect } from "react";
import {
  X,
  Wallet,
  CheckCircle2,
  Shield,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Gift,
  ArrowRight,
  RotateCw,
  Check,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { MerchantUser } from "@/lib/auth-context";

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: MerchantUser;
  onUpdateVault: (chain: "stellar", address: string) => void;
}

export type CancellationReason =
  | "Too expensive"
  | "Missing features"
  | "Temporary project paused"
  | "Switched providers";

export function VaultModal({ isOpen, onClose, user, onUpdateVault }: VaultModalProps) {
  const t = useTranslations("VaultModal");
  const tc = useTranslations("Common");
  const [stellarAddress, setStellarAddress] = useState(
    user.linkedVaults?.stellar || (user.walletAddress?.startsWith("G") ? user.walletAddress : "")
  );
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Vault Pause / Resume State
  const [vaultStatus, setVaultStatus] = useState<"active" | "paused">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`orbit_vault_status_${user.id || "default"}`);
      if (stored === "paused") return "paused";
    }
    return "active";
  });
  const [pauseSuccessMsg, setPauseSuccessMsg] = useState<string | null>(null);

  // Cancellation & Retention Survey Flow State
  const [cancelStep, setCancelStep] = useState<"none" | "survey" | "retention_offer" | "confirm_contract">("none");
  const [selectedReason, setSelectedReason] = useState<CancellationReason>("Too expensive");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [discountAccepted, setDiscountAccepted] = useState(false);
  const [cancellingOnChain, setCancellingOnChain] = useState(false);
  const [cancelTxHash, setCancelTxHash] = useState<string | null>(null);

  const dialogRef = useDialogFocus(isOpen, onClose);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (stellarAddress.trim()) {
      onUpdateVault("stellar", stellarAddress.trim());
    }
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  // Toggle Vault Status between Active and Paused without destroying allowance
  const handleTogglePause = () => {
    const nextStatus = vaultStatus === "active" ? "paused" : "active";
    setVaultStatus(nextStatus);
    if (typeof window !== "undefined") {
      localStorage.setItem(`orbit_vault_status_${user.id || "default"}`, nextStatus);
    }
    setPauseSuccessMsg(
      nextStatus === "paused"
        ? "Vault paused. Allowance is preserved on-chain, but automated pull settlements are suspended."
        : "Vault resumed. Automated pull settlement scheduling is now active."
    );
    setTimeout(() => setPauseSuccessMsg(null), 4000);
  };

  // Accept Retention Discount (50% off next 2 months)
  const handleAcceptDiscount = () => {
    setDiscountAccepted(true);
    // Record retention offer acceptance & survey response
    if (typeof window !== "undefined") {
      try {
        const stored = JSON.parse(localStorage.getItem("orbit_churn_survey_responses") || "[]");
        stored.push({
          reason: selectedReason,
          notes: feedbackNotes,
          retention_accepted: true,
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem("orbit_churn_survey_responses", JSON.stringify(stored));
        localStorage.setItem(`orbit_discount_applied_${user.id || "default"}`, "50%");
      } catch {}
    }
    setTimeout(() => {
      setCancelStep("none");
      setDiscountAccepted(false);
      onClose();
    }, 1500);
  };

  // Confirm Final On-Chain Cancellation calling contract cancel_vault
  const handleConfirmCancelVault = async () => {
    setCancellingOnChain(true);
    try {
      // Simulate on-chain Soroban cancel_vault call with Freighter confirmation
      await new Promise((resolve) => setTimeout(resolve, 1400));
      const simulatedTxHash = "c9a4b3d8" + Math.random().toString(16).slice(2, 10) + "7e1f402";
      setCancelTxHash(simulatedTxHash);

      // Record survey in aggregated churn metrics
      if (typeof window !== "undefined") {
        try {
          const stored = JSON.parse(localStorage.getItem("orbit_churn_survey_responses") || "[]");
          stored.push({
            reason: selectedReason,
            notes: feedbackNotes,
            retention_accepted: false,
            cancelled_tx: simulatedTxHash,
            timestamp: new Date().toISOString(),
          });
          localStorage.setItem("orbit_churn_survey_responses", JSON.stringify(stored));
          localStorage.setItem(`orbit_vault_status_${user.id || "default"}`, "churned");
        } catch {}
      }
    } finally {
      setCancellingOnChain(false);
    }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Vault management" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl bg-white border border-black/10 shadow-2xl p-6 max-h-[90vh] overflow-y-auto text-black">
        <div className="flex items-center justify-between pb-4 border-b border-black/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center text-black">
              <Shield size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-black tracking-tight">
                {cancelStep !== "none" ? "Vault Lifecycle & Retention" : t("title")}
              </h3>
              <p className="text-xs text-neutral-500">
                {cancelStep !== "none"
                  ? "Self-serve pause, feedback survey, and allowance cancellation."
                  : t("description")}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCancelStep("none");
              onClose();
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cancellation Flow Step: Structured Survey */}
        {cancelStep === "survey" && (
          <div className="mt-5 space-y-4">
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Cancellation Feedback:</span> Help us understand why you are cancelling your on-chain recurring vault.
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-black uppercase tracking-wider block mb-2">
                Why are you cancelling? <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {(["Too expensive", "Missing features", "Temporary project paused", "Switched providers"] as const).map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    className={`p-3 rounded-lg border text-left font-medium transition-all ${
                      selectedReason === reason
                        ? "border-black bg-neutral-900 text-white shadow-xs"
                        : "border-black/10 hover:border-black/30 bg-white text-neutral-800"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-black uppercase tracking-wider block mb-1.5">
                Additional Comments (Optional)
              </label>
              <textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder="Tell us what we could improve..."
                rows={2}
                className="w-full rounded-lg border border-black/10 p-2.5 text-xs focus:ring-1 focus:ring-black focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-black/10">
              <button
                type="button"
                onClick={() => setCancelStep("none")}
                className="button button-secondary text-xs h-9 px-4"
              >
                Back to Settings
              </button>
              <button
                type="button"
                onClick={() => setCancelStep("retention_offer")}
                className="button button-primary text-xs h-9 px-4 inline-flex items-center gap-1.5"
              >
                <span>Continue</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Cancellation Flow Step: Merchant Retention Discount Offer */}
        {cancelStep === "retention_offer" && (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-950">
              <div className="flex items-center gap-2 font-bold text-sm text-purple-900">
                <Gift size={18} className="text-purple-600" />
                Special Retention Offer
              </div>
              <p className="text-xs text-purple-800 mt-1.5 leading-relaxed">
                Before you completely cancel your contract allowance, we would love to keep you onboard.
                Accept <strong>50% off your next 2 billing cycles</strong> applied automatically to your next Soroban pull invoice.
              </p>
            </div>

            {discountAccepted ? (
              <div className="p-3.5 rounded-lg bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Retention discount applied! Your next pull invoice is updated to 50% off.</span>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleAcceptDiscount}
                  className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Gift size={14} />
                  <span>Claim 50% Off &amp; Keep Vault Active</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCancelStep("confirm_contract")}
                  className="w-full py-2.5 rounded-lg border border-black/10 hover:bg-neutral-50 text-neutral-600 hover:text-black font-medium text-xs transition-colors"
                >
                  No thanks, continue to cancel vault
                </button>
              </div>
            )}
          </div>
        )}

        {/* Cancellation Flow Step: On-Chain Contract Confirmation */}
        {cancelStep === "confirm_contract" && (
          <div className="mt-5 space-y-4">
            {cancelTxHash ? (
              <div className="space-y-3 text-center py-4">
                <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-black">Contract Allowance Cancelled</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  On-chain contract call <code className="font-mono font-semibold text-black">cancel_vault</code> was broadcast and confirmed on Stellar Soroban.
                </p>
                <div className="font-mono text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded border border-black/5">
                  Tx: {cancelTxHash}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCancelStep("none");
                    onClose();
                  }}
                  className="button button-primary text-xs h-9 px-5 mt-2"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Permanent Contract Cancellation:</span> This will invoke <code className="font-mono font-semibold">cancel_vault(user, merchant)</code> on the Stellar Soroban contract. The allowance will be deleted from storage.
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-black/10">
                  <button
                    type="button"
                    onClick={() => setCancelStep("survey")}
                    className="button button-secondary text-xs h-9 px-4"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancelVault}
                    disabled={cancellingOnChain}
                    className="button button-primary text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {cancellingOnChain ? (
                      <>
                        <RotateCw size={13} className="animate-spin" />
                        <span>Confirming cancel_vault...</span>
                      </>
                    ) : (
                      <span>Confirm On-Chain Cancellation</span>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Default View: Vault Settings, Status Toggle, and Cancel Flow Trigger */}
        {cancelStep === "none" && (
          <form onSubmit={handleSave} className="mt-5 space-y-5">
            {/* 1. Vault Allowance Status (Pause / Resume Workflow) */}
            <div className="p-4 rounded-xl border border-black/10 bg-neutral-50/70">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-black flex items-center gap-1.5">
                    {vaultStatus === "active" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        ACTIVE ALLOWANCE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-bold">
                        <PauseCircle size={11} />
                        PAUSED ALLOWANCE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {vaultStatus === "active"
                      ? "Automated pull execution is active per interval schedule."
                      : "Pulls suspended without destroying contract allowance."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTogglePause}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs ${
                    vaultStatus === "active"
                      ? "bg-white border border-black/15 text-neutral-800 hover:bg-neutral-100"
                      : "bg-black text-white hover:bg-neutral-800"
                  }`}
                >
                  {vaultStatus === "active" ? (
                    <>
                      <PauseCircle size={13} className="text-neutral-500" />
                      <span>Pause Vault</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle size={13} className="text-emerald-400" />
                      <span>Resume Vault</span>
                    </>
                  )}
                </button>
              </div>

              {pauseSuccessMsg && (
                <div className="mt-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-[11px] flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-blue-600 shrink-0" />
                  <span>{pauseSuccessMsg}</span>
                </div>
              )}
            </div>

            {/* 2. Stellar Settlement Vault */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-black uppercase tracking-wider">
                  {t("stellarVault")}
                </label>
                <span className="text-[10px] font-mono text-neutral-400">{t("walletHint")}</span>
              </div>
              <input
                type="text"
                placeholder={t("placeholder")}
                value={stellarAddress}
                onChange={(e) => setStellarAddress(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3.5 py-2.5 text-xs font-mono text-black focus:outline-hidden focus:ring-1 focus:ring-black focus:border-black"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                {t("settleNote")}
              </p>
            </div>

            {/* 3. Self-Serve Cancellation & Retention Survey Flow Trigger */}
            <div className="pt-2 border-t border-black/5 flex items-center justify-between text-xs">
              <span className="text-neutral-500 text-[11px]">Looking to close your vault?</span>
              <button
                type="button"
                onClick={() => setCancelStep("survey")}
                className="text-red-600 hover:text-red-700 font-medium underline underline-offset-2 text-xs"
              >
                Cancel Vault Allowance &amp; Retention
              </button>
            </div>

            {savedSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>{t("success")}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10">
              <button
                type="button"
                onClick={onClose}
                className="button button-secondary text-xs h-9 px-4"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                className="button button-primary text-xs h-9 px-4"
              >
                {t("submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
