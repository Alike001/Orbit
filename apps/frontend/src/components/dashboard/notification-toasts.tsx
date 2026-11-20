"use client";

import { X, ExternalLink } from "lucide-react";
import { useNotifications } from "@/lib/notification-context";

export function NotificationToasts() {
  const { toasts, dismissToast } = useNotifications();
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const explorerUrl = toast.txHash && /^[a-fA-F0-9]{64}$/.test(toast.txHash.replace(/^0x/, ""))
          ? `https://stellar.expert/explorer/${toast.network === "public" ? "public" : "testnet"}/tx/${encodeURIComponent(toast.txHash)}`
          : null;
        return (
          <div key={toast.id} role="status" className="pointer-events-auto rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{toast.title}</p>
                <p className="mt-1 text-xs text-neutral-600">{toast.message}</p>
                {explorerUrl && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline">View transaction <ExternalLink size={12} /></a>}
              </div>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification" className="rounded p-1 hover:bg-neutral-100"><X size={16} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
