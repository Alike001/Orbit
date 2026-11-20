"use client";

import { useState } from "react";
import { X, Key, Check, Copy, AlertTriangle, ShieldCheck } from "lucide-react";
import { ApiKeyRecord } from "../dashboard-types";

interface CreateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateKey: (key: ApiKeyRecord) => void;
}

export function CreateApiKeyModal({ isOpen, onClose, onCreateKey }: CreateApiKeyModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [scopes, setScopes] = useState<string[]>(["subscribers:read"]);
  const availableScopes = ["pull:execute", "plans:write", "subscribers:read", "webhooks:admin"];
  const [keyName, setKeyName] = useState("");
  const [environment, setEnvironment] = useState<"test" | "live">("live");
  const [generatedKey, setGeneratedKey] = useState<ApiKeyRecord | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim() || scopes.length === 0) return;

    const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");

    const prefix = environment === "live" ? "orb_live" : "orb_test";
    const fullKey = `${prefix}_${randomSuffix}`;

    const newKeyRecord: ApiKeyRecord = {
      id: `key_${crypto.randomUUID()}`,
      name: keyName.trim(),
      keyPrefix: `${prefix}_...${randomSuffix.slice(-4)}`,
      fullKeyPreview: fullKey,
      environment,
      scopes,
      lastUsed: "Never",
      createdAt: new Date().toISOString(),
    };

    onCreateKey(newKeyRecord);
    setGeneratedKey(newKeyRecord);
    setStep(2);
  };

  const resetAndClose = () => {
    setStep(1);
    setKeyName("");
    setEnvironment("live");
    setScopes(["subscribers:read"]);
    setGeneratedKey(null);
    setCopied(false);
    onClose();
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl bg-white border border-black/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center text-black">
              <Key size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-black tracking-tight">
                {step === 1 ? "Generate API Secret Key" : "Save Your Secret Key"}
              </h3>
              <p className="text-xs text-neutral-500">
                {step === 1
                  ? "Authenticate programmatic pull requests from your backend."
                  : "Copy this key now. For your security, it will not be shown again."}
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

        {step === 1 && (
          <form onSubmit={handleGenerate} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1.5">
                Key Label / Application Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Production Backend, AI Compute Service, Zapier"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3.5 py-2.5 text-xs text-black focus:outline-hidden focus:ring-1 focus:ring-black"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1.5">
                Environment
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEnvironment("live")}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    environment === "live"
                      ? "border-black bg-neutral-50 ring-1 ring-black/5"
                      : "border-black/10 hover:bg-neutral-50"
                  }`}
                >
                  <div className="font-bold text-xs text-black flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Live Environment</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 font-mono">
                    orb_live_...
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEnvironment("test")}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    environment === "test"
                      ? "border-black bg-neutral-50 ring-1 ring-black/5"
                      : "border-black/10 hover:bg-neutral-50"
                  }`}
                >
                  <div className="font-bold text-xs text-black flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>Testnet Sandbox</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 font-mono">
                    orb_test_...
                  </div>
                </button>
              </div>
            </div>

            <fieldset className="rounded-lg border border-black/10 p-3"><legend className="text-xs font-semibold">Permission scopes</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{availableScopes.map(scope => <label key={scope} className="flex gap-2 items-center text-xs"><input type="checkbox" checked={scopes.includes(scope)} onChange={e => setScopes(prev => e.target.checked ? [...prev, scope] : prev.filter(item => item !== scope))} />{scope}</label>)}</div><p className="text-xs text-amber-700 mt-2">Scopes are saved as UI metadata; backend enforcement is required before these keys can safely grant access.</p></fieldset>
            <div className="p-3.5 rounded-lg bg-neutral-50 border border-black/5 text-xs text-neutral-600 flex items-start gap-2.5">
              <ShieldCheck size={16} className="text-black shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-black">Bearer Token Authentication:</span>{" "}
                Pass this key in the <code className="font-mono text-[11px] text-black">Authorization: Bearer &lt;KEY&gt;</code> header on all server-side API requests.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/10">
              <button
                type="button"
                onClick={resetAndClose}
                className="button button-secondary text-xs h-9 px-4"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={scopes.length === 0}
                className="button button-primary text-xs h-9 px-4"
              >
                Generate Secret Key
              </button>
            </div>
          </form>
        )}

        {step === 2 && generatedKey && (
          <div className="p-6 space-y-5">
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Store this secret key securely!</span> You won&apos;t be able to see it again after closing this window.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                Secret API Key ({generatedKey.name})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedKey.fullKeyPreview}
                  className="w-full rounded-lg border border-black/10 px-3.5 py-2.5 text-xs font-mono bg-neutral-50 text-black font-semibold"
                />
                <button
                  onClick={() => copyKey(generatedKey.fullKeyPreview)}
                  className="button button-primary text-xs h-10 px-4 shrink-0 flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy Key</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/10">
              <button
                type="button"
                onClick={resetAndClose}
                className="button button-primary text-xs h-9 px-5"
              >
                I Have Saved My Key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
