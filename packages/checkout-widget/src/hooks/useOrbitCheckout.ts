/**
 * Issue #272: Headless React hooks package (@orbit/react) for custom checkout UI.
 *
 * useOrbitCheckout provides a clean, reactive state machine for building custom
 * checkout experiences without opinionated modal components. Merchants get full
 * control over styling (Tailwind / CSS modules) while the hook manages wallet
 * authorization, transaction simulation, signing, and settlement.
 *
 * Zero CSS overhead — exports unstyled primitives only.
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CheckoutStatus =
  | "idle"
  | "connecting_wallet"
  | "simulating"
  | "awaiting_signature"
  | "settling"
  | "success"
  | "error";

export type CheckoutError = {
  code: string;
  message: string;
  /** Whether the error is recoverable (retry possible) or terminal */
  recoverable: boolean;
};

export type VaultData = {
  txHash: string;
  amount: string;
  token: string;
  interval: number;
  merchant: string;
};

export interface UseOrbitCheckoutOptions {
  planId?: string;
  merchantAddress: string;
  onSettled?: (vault: VaultData) => void;
  onError?: (error: CheckoutError) => void;
}

export interface UseOrbitCheckoutReturn {
  status: CheckoutStatus;
  error: CheckoutError | null;
  vaultData: VaultData | null;
  authorizeVault: () => Promise<void>;
  reset: () => void;
}

// ─── Error helpers ──────────────────────────────────────────────────────────

function makeError(code: string, message: string, recoverable = true): CheckoutError {
  return { code, message, recoverable };
}

const WALLET_REJECTION_ERROR = makeError(
  "WALLET_REJECTED",
  "Wallet authorization was rejected. Please approve the transaction to continue.",
);

const SIMULATION_ERROR = makeError(
  "SIMULATION_FAILED",
  "Transaction simulation failed. Please check your inputs and try again.",
);

const NETWORK_ERROR = makeError(
  "NETWORK_ERROR",
  "Network error. Please check your connection and try again.",
);

const SETTLEMENT_ERROR = makeError(
  "SETTLEMENT_FAILED",
  "Transaction was signed but settlement failed. Please contact support.",
  false,
);

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOrbitCheckout({
  planId,
  merchantAddress,
  onSettled,
  onError,
}: UseOrbitCheckoutOptions): UseOrbitCheckoutReturn {
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [error, setError] = useState<CheckoutError | null>(null);
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const abortedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortedRef.current = true;
    };
  }, []);

  const updateStatus = useCallback((next: CheckoutStatus) => {
    if (!abortedRef.current) {
      setStatus(next);
    }
  }, []);

  const fail = useCallback(
    (err: CheckoutError) => {
      if (abortedRef.current) return;
      setError(err);
      setStatus("error");
      onError?.(err);
    },
    [onError],
  );

  const succeed = useCallback(
    (data: VaultData) => {
      if (abortedRef.current) return;
      setVaultData(data);
      setStatus("success");
      onSettled?.(data);
    },
    [onSettled],
  );

  const authorizeVault = useCallback(async () => {
    if (abortedRef.current) return;

    try {
      updateStatus("connecting_wallet");

      // Dynamic import of wallet bridge to avoid coupling headless hook to specific wallet
      const { connectWallet } = await import("../bridge.js");
      const wallet = await connectWallet();

      if (!wallet || !wallet.address) {
        fail(makeError("WALLET_NOT_CONNECTED", "No wallet connected. Please connect a wallet first."));
        return;
      }

      updateStatus("simulating");

      // Simulate the vault creation transaction
      const { simulateVaultCreation } = await import("../soroban.js");
      const simulation = await simulateVaultCreation({
        wallet,
        planId,
        merchantAddress,
      });

      if (!simulation.success) {
        fail(SIMULATION_ERROR);
        return;
      }

      updateStatus("awaiting_signature");

      // Request user signature
      const { signTransaction } = await import("../bridge.js");
      const signedTx = await signTransaction(wallet, simulation.txXdr);

      if (!signedTx) {
        fail(WALLET_REJECTION_ERROR);
        return;
      }

      updateStatus("settling");

      // Submit and await settlement
      const { submitTransaction } = await import("../soroban.js");
      const result = await submitTransaction(signedTx);

      if (!result.success) {
        fail(SETTLEMENT_ERROR);
        return;
      }

      succeed({
        txHash: result.txHash,
        amount: simulation.amount,
        token: simulation.token,
        interval: simulation.interval,
        merchant: merchantAddress,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();

      if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel")) {
        fail(WALLET_REJECTION_ERROR);
      } else if (lower.includes("simulate") || lower.includes("preflight")) {
        fail(SIMULATION_ERROR);
      } else if (lower.includes("network") || lower.includes("timeout") || lower.includes("connection")) {
        fail(NETWORK_ERROR);
      } else {
        fail(makeError("UNKNOWN", `Unexpected error: ${msg}`));
      }
    }
  }, [planId, merchantAddress, fail, succeed, updateStatus]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setVaultData(null);
    abortedRef.current = false;
  }, []);

  return {
    status,
    error,
    vaultData,
    authorizeVault,
    reset,
  };
}

export default useOrbitCheckout;
