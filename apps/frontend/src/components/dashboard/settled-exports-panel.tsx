"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { ORBIT_API_URL, merchantRequestHeaders } from "@/lib/api";
import { explorerTransactionUrl, ledgerFinancialCsv, type LedgerSettlementRow, type SettledPayment } from "@/lib/financial-exports";

interface Invoice {
  id: string;
  invoice_number: string;
  status: "processing" | "ready" | "failed";
  transaction_hash: string;
  ledger_sequence: number | null;
  settled_at: string;
}
interface Props { isOpen: boolean; }

export function SettledExportsPanel({ isOpen }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [planId, setPlanId] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch(new URL("/invoices", ORBIT_API_URL).toString(), { headers: merchantRequestHeaders(), cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load merchant invoices. Check your API credentials.");
        return response.json() as Promise<{ invoices: Invoice[] }>;
      })
      .then(data => { if (active) setInvoices(data.invoices ?? []); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Invoice lookup failed"); });
    return () => { active = false; };
  }, [isOpen]);
  const downloadCsv = async () => {
    setError("");
    if (from && to && from > to) { setError("The start date must precede the end date."); return; }
    if (planId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)) {
      setError("Plan ID must be a UUID."); return;
    }
    const params = new URLSearchParams({ status: "settled" });
    if (from) params.set("start_date", from);
    if (to) params.set("end_date", to);
    if (planId.trim()) params.set("plan_id", planId.trim());
    setLoading(true);
    try {
      const response = await fetch(new URL("/reports/transactions/export?" + params, ORBIT_API_URL), {
        headers: merchantRequestHeaders(), cache: "no-store",
      });
      if (!response.ok) throw new Error("Settlement export failed (" + response.status + ").");
      const body = await response.text();
      const parsed = Papa.parse<LedgerSettlementRow>(body, { header: true, skipEmptyLines: "greedy" });
      if (parsed.errors.length) throw new Error("Malformed settlement CSV returned by the server.");
      const invoiceLedgers = new Map(invoices.map(inv => [inv.transaction_hash, inv.ledger_sequence]));
      const planIds = [...new Set(parsed.data.map(tx => tx.plan_id).filter(Boolean))];
      const planEntries = await Promise.all(planIds.map(async id => {
        try {
          const result = await fetch(new URL("/plans/" + encodeURIComponent(id), ORBIT_API_URL), { headers: merchantRequestHeaders() });
          if (!result.ok) return [id, ""] as const;
          const body = await result.json() as { plan?: { name?: string } };
          return [id, body.plan?.name ?? ""] as const;
        } catch { return [id, ""] as const; }
      }));
      const planNames = new Map(planEntries);
      const blob = new Blob(["\uFEFF" + ledgerFinancialCsv(parsed.data, invoiceLedgers, planNames)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "orbit-settled-transactions.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement export failed");
    } finally { setLoading(false); }
  };
  const downloadInvoice = async (invoice: Invoice) => {
    setError("");
    try {
      const response = await fetch(new URL("/invoices/" + encodeURIComponent(invoice.id) + "/download", ORBIT_API_URL), {
        headers: merchantRequestHeaders(), cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not request the signed receipt (" + response.status + ").");
      const data = await response.json() as { url: string };
      const url = new URL(data.url);
      if (url.protocol !== "https:") throw new Error("Receipt URL must use HTTPS");
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch (err) { setError(err instanceof Error ? err.message : "Receipt download failed"); }
  };
  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 sm:p-5 space-y-4 text-xs">
      <div>
        <h3 className="text-base font-bold text-black">Verified settlement exports and receipts</h3>
        <p className="text-neutral-500 mt-1">Download merchant-authenticated settlement records or official stored PDF invoices. Only confirmed transactions are exported. Unrecorded network fees and ledger values are left blank rather than estimated.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="space-y-1">From date <input className="block w-full rounded-lg border border-black/10 p-2" aria-label="Settlement start date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="space-y-1">To date <input className="block w-full rounded-lg border border-black/10 p-2" aria-label="Settlement end date" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label className="space-y-1">Plan ID (optional) <input className="block w-full rounded-lg border border-black/10 p-2" aria-label="Settlement plan UUID" value={planId} onChange={e => setPlanId(e.target.value)} placeholder="Plan UUID" /></label>
      </div>
      <button type="button" disabled={loading} onClick={downloadCsv} className="button button-primary px-4 py-2 disabled:opacity-40">{loading ? "Exporting…" : "Download settled CSV"}</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-black/10"><th className="p-2">Invoice</th><th className="p-2">Settlement time</th><th className="p-2">Ledger</th><th className="p-2">Verification</th><th className="p-2">Receipt</th></tr></thead>
          <tbody>{invoices.filter(i => (!from || i.settled_at?.slice(0, 10) >= from) && (!to || i.settled_at?.slice(0, 10) <= to)).map(invoice => (
            <tr key={invoice.id} className="border-b border-black/5">
              <td className="p-2 font-mono">{invoice.invoice_number}</td>
              <td className="p-2">{invoice.settled_at ? new Date(invoice.settled_at).toLocaleString() : "—"}</td>
              <td className="p-2">{invoice.ledger_sequence ?? "—"}</td>
              <td className="p-2">{/^[a-f0-9]{64}$/i.test(invoice.transaction_hash ?? "") ? (
                <a href={explorerTransactionUrl({ txHash: invoice.transaction_hash, network: (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "TESTNET").toUpperCase() === "PUBLIC" ? "public" : "testnet" })} target="_blank" rel="noopener noreferrer" className="underline">Stellar Expert</a>
              ) : "—"}</td>
              <td className="p-2"><button type="button" disabled={invoice.status !== "ready"} className="underline disabled:text-neutral-400" onClick={() => downloadInvoice(invoice)}>{invoice.status === "ready" ? "Download PDF" : invoice.status}</button></td>
            </tr>
          ))}</tbody>
        </table>
        {invoices.length === 0 && <p className="py-3 text-neutral-500">No issued invoices returned by the merchant API.</p>}
      </div>
    </section>
  );
}
