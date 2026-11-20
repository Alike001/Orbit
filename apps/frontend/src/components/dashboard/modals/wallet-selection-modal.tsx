"use client";

import type { WalletProvider } from "@/lib/wallet-adapters";

interface Props {
  isOpen: boolean;
  busy: boolean;
  error: string;
  onSelect: (provider: WalletProvider) => void;
  onClose: () => void;
}
const PROVIDERS: { id: WalletProvider; name: string; description: string; url: string }[] = [
  { id: "freighter", name: "Freighter", description: "Stellar browser extension", url: "https://www.freighter.app/" },
  { id: "albedo", name: "Albedo", description: "Browser-independent signer", url: "https://albedo.link/" },
  { id: "xbull", name: "xBull", description: "Stellar extension wallet", url: "https://xbull.app/" },
];
export function WalletSelectionModal({ isOpen, busy, error, onSelect, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-selector-title" onKeyDown={e => { if (e.key === "Escape" && !busy) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wallet-selector-title" className="text-lg font-bold text-black">Connect your Stellar wallet</h2>
            <p className="text-xs text-neutral-500 mt-1">Choose which wallet should connect to Orbit.</p>
          </div>
          <button type="button" aria-label="Close wallet selector" className="text-neutral-500 hover:text-black" disabled={busy} onClick={onClose}>✕</button>
        </div>
        <div className="space-y-2">
          {PROVIDERS.map(provider => (
            <button type="button" key={provider.id} disabled={busy} onClick={() => onSelect(provider.id)} className="w-full rounded-xl border border-black/10 p-4 text-left hover:bg-neutral-50 hover:border-black/30 disabled:opacity-50">
              <span className="block text-sm font-semibold text-black">{provider.name}</span>
              <span className="block text-xs text-neutral-500 mt-1">{provider.description}</span>
            </button>
          ))}
        </div>
        {error && <div role="alert" className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          {error}
          <div className="mt-2 flex flex-wrap gap-3">
            {PROVIDERS.map(provider => <a key={provider.id} href={provider.url} target="_blank" rel="noopener noreferrer" className="underline">{provider.name} website</a>)}
          </div>
        </div>}
      </div>
    </div>
  );
}
