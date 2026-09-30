"use client";

import { useState, useRef } from "react";
import {
  SendHorizontal,
  Upload,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Zap,
  ExternalLink,
  Copy,
  Check,
  FileSpreadsheet,
  Users,
  ShieldCheck,
} from "lucide-react";
import { PayrollRecipient } from "../dashboard-types";
import Papa from "papaparse";
import { StrKey } from "@stellar/stellar-sdk";

const SAMPLE_RECIPIENTS: PayrollRecipient[] = [
  {
    id: "rec_charlie_01",
    name: "Charlie Vance",
    role: "Smart Contract Lead",
    walletAddress: "GCHAR7V4D8L4C0F6A2H8J1K5W9Y3K7M2P6B3XQ4Z7M5",
    amount: 500.0,
    network: "stellar-testnet",
    status: "ready",
  },
  {
    id: "rec_sarah_02",
    name: "Sarah Lin",
    role: "Frontend Engineer",
    walletAddress: "GSAR49A1H5J8K2GB3XQ4Z7M5W8Y2K6T1R9P0V4N8D2",
    amount: 400.0,
    network: "stellar-testnet",
    status: "ready",
  },
  {
    id: "rec_david_03",
    name: "David Kim",
    role: "UI/UX Designer",
    walletAddress: "GDAV84N2L7C3F9A1H5J8K2GB3XQ4Z7M5W8Y2K6T1",
    amount: 200.0,
    network: "stellar-testnet",
    status: "ready",
  },
  {
    id: "rec_elena_04",
    name: "Elena Rostova",
    role: "Community Manager",
    walletAddress: "GELE93M4K8P1T6R9V0D2L7C3F9A1H5J8K2W8Y2K5",
    amount: 100.0,
    network: "stellar-testnet",
    status: "ready",
  },
];

export function PayrollView() {
  const [recipients, setRecipients] = useState<PayrollRecipient[]>(SAMPLE_RECIPIENTS);
  const [isExecuting, setIsExecuting] = useState(false);
  const [disbursedSuccess, setDisbursedSuccess] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Add Modal / Row state
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newWallet, setNewWallet] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const totalPayout = recipients.reduce((acc, r) => acc + (r.status === "ready" ? r.amount : 0), 0);
  const readyCount = recipients.filter((r) => r.status === "ready").length;

  const handleLoadSampleCSV = () => {
    setRecipients(SAMPLE_RECIPIENTS);
    setDisbursedSuccess(null);
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Name,Role,StellarWallet,AmountUSDC\r\n" +
      "Charlie Vance,Smart Contract Lead,GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5,500\r\n" +
      "Sarah Lin,Frontend Engineer,GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN,400\r\n" +
      "David Kim,UI/UX Designer,GCKFBEIYV2U22IO2GUOWGQPTZX2I6DBA7EIEWIXKXZQJ2D3XN6XU4X7P,200\r\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "orbit_payroll_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvErrors([]);

    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (results) => {
        const rows = results.data;
        if (!rows || rows.length === 0) {
          setCsvErrors(["The uploaded CSV file is empty."]);
          return;
        }

        const errors: string[] = [];
        const validRecipients: PayrollRecipient[] = [];

        // Check if first row is a header row
        const firstRowStr = rows[0].join(" ").toLowerCase();
        const hasHeader =
          firstRowStr.includes("name") ||
          firstRowStr.includes("wallet") ||
          firstRowStr.includes("role") ||
          firstRowStr.includes("amount");

        const startIdx = hasHeader ? 1 : 0;

        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 1;

          if (row.length < 2) {
            errors.push(`Row ${rowNum}: Insufficient columns (expected at least wallet address and amount).`);
            continue;
          }

          let name = `Recipient ${rowNum}`;
          let role = "Contractor";
          let wallet = "";
          let rawAmount = "";

          if (row.length >= 4) {
            name = row[0]?.trim() || name;
            role = row[1]?.trim() || role;
            wallet = row[2]?.trim() || "";
            rawAmount = row[3]?.trim() || "";
          } else if (row.length === 3) {
            name = row[0]?.trim() || name;
            wallet = row[1]?.trim() || "";
            rawAmount = row[2]?.trim() || "";
          } else {
            wallet = row[0]?.trim() || "";
            rawAmount = row[1]?.trim() || "";
          }

          const rowIssues: string[] = [];

          if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
            rowIssues.push(`invalid Stellar address "${wallet || "empty"}"`);
          }

          const parsedAmount = parseFloat(rawAmount);
          if (!rawAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
            rowIssues.push(`invalid or non-positive amount "${rawAmount || "empty"}"`);
          }

          if (rowIssues.length > 0) {
            errors.push(`Row ${rowNum}: ${rowIssues.join(", ")}`);
          } else {
            validRecipients.push({
              id: `rec_csv_${i}_${Math.random().toString(36).substring(2, 6)}`,
              name,
              role,
              walletAddress: wallet,
              amount: parsedAmount,
              network: "stellar-testnet",
              status: "ready",
            });
          }
        }

        if (errors.length > 0) {
          setCsvErrors(errors);
        }

        if (validRecipients.length > 0) {
          setRecipients(validRecipients);
          setDisbursedSuccess(null);
        }
      },
      error: (err) => {
        setCsvErrors([`Failed to parse CSV file: ${err.message}`]);
      },
    });

    e.target.value = "";
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newWallet.trim() || !newAmount) return;

    const newRec: PayrollRecipient = {
      id: `rec_man_${Math.random().toString(36).substring(2, 8)}`,
      name: newName.trim(),
      role: newRole.trim() || "Contractor",
      walletAddress: newWallet.trim(),
      amount: parseFloat(newAmount) || 100,
      network: "stellar-testnet",
      status: "ready",
    };

    setRecipients((prev) => [...prev, newRec]);
    setNewName("");
    setNewRole("");
    setNewWallet("");
    setNewAmount("");
    setIsAddingManual(false);
  };

  const handleRemove = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  };

  // Run Batch Payroll Trigger (simulates on-chain Soroban batch_disburse execution)
  const handleRunBatchPayroll = () => {
    if (readyCount === 0) return;
    setIsExecuting(true);
    setDisbursedSuccess(null);

    // Simulate single ledger transaction on Stellar Soroban
    setTimeout(() => {
      setRecipients((prev) =>
        prev.map((r) => ({
          ...r,
          status: "disbursed",
        }))
      );
      setIsExecuting(false);
      setDisbursedSuccess(
        `Batch Disbursement Succeeded! ${totalPayout.toLocaleString("en-US", {
          minimumFractionDigits: 2,
        })} USDC atomically distributed to ${readyCount} contractor wallets in a single ledger block (1.3s finality).`
      );
    }, 1300);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-black">
              Batch Payroll Engine
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black text-white font-bold tracking-wide">
              SUPERPOWER
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Disburse global contractor payroll in USDC with a single signature on Stellar Soroban.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="button button-secondary text-xs h-9 px-3 flex items-center gap-1.5"
          >
            <Upload size={13} />
            <span>Upload CSV</span>
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="button button-secondary text-xs h-9 px-3 flex items-center gap-1.5"
            title="Download blank sample CSV"
          >
            <Download size={13} />
            <span>Template</span>
          </button>
          <button
            onClick={() => setIsAddingManual(true)}
            className="button button-secondary text-xs h-9 px-3 flex items-center gap-1.5"
          >
            <Plus size={13} />
            <span>Add Row</span>
          </button>
          <button
            onClick={handleLoadSampleCSV}
            className="button button-secondary text-xs h-9 px-3 text-neutral-600 hover:text-black"
          >
            Reset Demo
          </button>
        </div>
      </div>

      {/* CSV Validation Error Banner */}
      {csvErrors.length > 0 && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-950 flex items-start gap-3 animate-in fade-in duration-200 shadow-xs">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-red-900">
                CSV validation issues ({csvErrors.length} {csvErrors.length === 1 ? "row" : "rows"} skipped):
              </span>
              <button
                onClick={() => setCsvErrors([])}
                className="text-red-700 hover:text-red-900 font-medium underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <ul className="list-disc list-inside space-y-1 text-red-800 font-mono text-[11px] max-h-32 overflow-y-auto">
              {csvErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {disbursedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-3 animate-in fade-in duration-200 shadow-xs">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Atomic Ledger Execution Confirmed:</span>{" "}
            {disbursedSuccess}
          </div>
        </div>
      )}

      {/* 2. Top Summary Ribbon & Run Batch CTA */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Total Payout Amount
          </div>
          <div className="text-3xl font-bold text-black mt-2 tracking-tight">
            {totalPayout.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
            <span className="text-sm font-semibold text-neutral-500 font-mono">USDC</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Across {readyCount} contractor wallets
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Ledger Execution
          </div>
          <div className="text-3xl font-bold text-black mt-2 tracking-tight">
            1 Signature
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            All transfers split atomically on-chain
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-black/10 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Network Gas Overhead
          </div>
          <div className="text-3xl font-bold text-emerald-600 mt-2 tracking-tight">
            &lt; $0.001
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Sub-cent Soroban fee for entire batch
          </div>
        </div>

        <div className="p-5 rounded-xl bg-neutral-900 text-white flex flex-col justify-between shadow-xs">
          <div>
            <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
              1-Click Disbursement
            </div>
            <div className="text-sm font-bold mt-1">
              Ready to execute batch
            </div>
          </div>

          <button
            onClick={handleRunBatchPayroll}
            disabled={isExecuting || readyCount === 0}
            className="w-full mt-3 button bg-white text-black hover:bg-neutral-100 font-bold text-xs h-10 px-4 flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
          >
            {isExecuting ? (
              <>
                <RotateCw size={14} className="animate-spin text-black" />
                <span>Broadcasting Batch...</span>
              </>
            ) : (
              <>
                <Zap size={14} className="text-black" />
                <span>Run Batch Payroll ({readyCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Manual Add Form Row */}
      {isAddingManual && (
        <form
          onSubmit={handleAddManual}
          className="p-4 rounded-xl border border-black/20 bg-neutral-50 space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-black uppercase tracking-wider">
              Add Contractor Payout Manually
            </h4>
            <button
              type="button"
              onClick={() => setIsAddingManual(false)}
              className="text-xs text-neutral-400 hover:text-black"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              required
              placeholder="Contractor Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs bg-white text-black"
            />
            <input
              type="text"
              placeholder="Role (e.g. Lead Engineer)"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs bg-white text-black"
            />
            <input
              type="text"
              required
              placeholder="Stellar Address (Starts with G...)"
              value={newWallet}
              onChange={(e) => setNewWallet(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs font-mono bg-white text-black"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                required
                min="1"
                placeholder="USDC Amount"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-xs font-mono bg-white text-black"
              />
              <button
                type="submit"
                className="button button-primary text-xs h-9 px-4 shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 3. Recipients Table */}
      <div className="rounded-xl border border-black/10 bg-white overflow-hidden shadow-xs">
        <div className="p-4 px-5 border-b border-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-black" />
            <h3 className="text-sm font-bold text-black">
              Payroll Distribution Manifest
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">
              {recipients.length} recipients
            </span>
          </div>

          <div className="text-xs font-mono text-neutral-500">
            Soroban Contract: <span className="text-black font-semibold">CAZBZB...YQNG</span>
          </div>
        </div>

        {recipients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/80 border-b border-black/10 text-neutral-500 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3.5 px-5">Contractor</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Stellar Payout Address</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-neutral-700">
                {recipients.map((rec) => (
                  <tr key={rec.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-4 px-5 font-semibold text-black">
                      {rec.name}
                    </td>

                    <td className="py-4 px-4 text-neutral-600">
                      {rec.role}
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-neutral-700">
                          {rec.walletAddress.slice(0, 6)}...{rec.walletAddress.slice(-6)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(rec.walletAddress, rec.id)}
                          className="p-1 rounded hover:bg-black/5 text-neutral-400 hover:text-black transition-colors"
                          title="Copy address"
                        >
                          {copiedKey === rec.id ? (
                            <Check size={11} className="text-emerald-600" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                        <a
                          href={`https://stellar.expert/explorer/testnet/account/${rec.walletAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded hover:bg-black/5 text-neutral-400 hover:text-black transition-colors"
                          title="View on Stellar Expert"
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </td>

                    <td className="py-4 px-4 font-mono font-bold text-black text-sm">
                      {rec.amount.toFixed(2)} USDC
                    </td>

                    <td className="py-4 px-4">
                      {rec.status === "disbursed" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          <CheckCircle2 size={11} />
                          DISBURSED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-black/5 font-medium">
                          READY
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => handleRemove(rec.id)}
                        className="p-1.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove recipient"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-3">
              <SendHorizontal size={22} />
            </div>
            <h4 className="font-semibold text-black text-sm">No recipients in payroll batch</h4>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Upload a contractor CSV spreadsheet or click &quot;Reset Demo&quot; to test a batch payout.
            </p>
            <button
              onClick={handleLoadSampleCSV}
              className="button button-primary text-xs h-9 px-4 mt-4"
            >
              Load Sample Batch
            </button>
          </div>
        )}
      </div>

      {/* Superpower Callout */}
      <div className="p-4 rounded-xl bg-neutral-50 border border-black/5 flex items-start gap-3 text-xs text-neutral-600">
        <ShieldCheck size={18} className="text-black shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-black">Atomic Batch Disbursement Guarantees:</span>
          {" "}Unlike traditional chains where payouts happen as N individual transactions that can partially fail, Orbit&apos;s Soroban smart contract (<code className="font-mono text-[11px] text-black">batch_disburse</code>) executes all transfers atomically. Either every single contractor gets paid, or the transaction safely rolls back.
        </div>
      </div>
    </div>
  );
}
