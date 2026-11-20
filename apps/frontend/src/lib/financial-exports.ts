/** Financial CSV and lightweight offline PDF receipt export utilities. */
export interface SettledPayment {
  ledgerSequence: number;
  txHash: string;
  customerAddress: string;
  planName: string;
  grossUsdc: number;
  networkFee: number;
  settledAt: string;
  network: "testnet" | "public";
}
export interface PaymentFilters {
  from?: string;
  to?: string;
  plan?: string;
  status?: "settled" | "all";
}
const CSV_HEADERS = ["Ledger Sequence", "Tx Hash", "Customer Address", "Plan Name", "Gross Amount (USDC)", "Network Fee", "Settlement Timestamp"] as const;
function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}
export function selectSettledPayments(rows: SettledPayment[], filters: PaymentFilters): SettledPayment[] {
  return rows.filter((row) => {
    const day = row.settledAt.slice(0, 10);
    return (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to) &&
      (!filters.plan || row.planName === filters.plan);
  });
}
export function financialCsv(rows: SettledPayment[]): string {
  const records = rows.map((r) => [
    r.ledgerSequence, r.txHash, r.customerAddress, r.planName,
    r.grossUsdc.toFixed(7), r.networkFee.toFixed(7), r.settledAt,
  ]);
  return [CSV_HEADERS, ...records].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export interface LedgerSettlementRow {
  plan_id: string;
  transaction_hash: string;
  customer_wallet: string;
  amount_usdc_units: string;
  settled_at: string;
  network_fee_usdc_units?: string;
}
export function decimalUsdc(units: string): string {
  const value = BigInt(units);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10000000n;
  const fraction = (absolute % 10000000n).toString().padStart(7, "0");
  return (negative ? "-" : "") + whole + "." + fraction;
}
export function ledgerFinancialCsv(
  transactions: LedgerSettlementRow[],
  invoiceLedgers: ReadonlyMap<string, number | null>,
  planNames: ReadonlyMap<string, string>
): string {
  const rows = transactions.map(tx => [
    invoiceLedgers.get(tx.transaction_hash) ?? "",
    tx.transaction_hash,
    tx.customer_wallet,
    planNames.get(tx.plan_id) ?? "",
    decimalUsdc(tx.amount_usdc_units),
    tx.network_fee_usdc_units ? decimalUsdc(tx.network_fee_usdc_units) : "",
    tx.settled_at,
  ]);
  return [CSV_HEADERS, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function explorerTransactionUrl(row: Pick<SettledPayment, "network" | "txHash">): string {
  if (!/^[a-f0-9]{64}$/i.test(row.txHash)) throw new Error("Invalid Stellar transaction hash");
  return `https://stellar.expert/explorer/${row.network}/tx/${row.txHash}`;
}
export function downloadFinancialCsv(rows: SettledPayment[], filename = "orbit-settlements.csv"): void {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + financialCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// The PDF writer creates a small valid one-page PDF without a network request or a heavyweight dependency.
function pdfEscape(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
export function receiptPdf(row: SettledPayment, merchantName: string): Uint8Array {
  const verify = explorerTransactionUrl(row);
  const lines = [
    "ORBIT - PAYMENT RECEIPT", merchantName,
    "Status: SETTLED",
    "Plan: " + row.planName,
    "Gross: " + row.grossUsdc.toFixed(7) + " USDC",
    "Network fee: " + row.networkFee.toFixed(7) + " USDC",
    "Ledger: " + row.ledgerSequence,
    "Settled at (UTC): " + row.settledAt,
    "Customer: " + row.customerAddress,
    "Transaction hash: " + row.txHash,
    "Verify: " + verify,
  ];
  const commands = ["BT", "/F1 11 Tf", "50 775 Td", "15 TL", ...lines.flatMap((line, index) =>
    [index === 0 ? "/F1 17 Tf" : "/F1 11 Tf", "(" + pdfEscape(line) + ") Tj", "T*"]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const pos of offsets.slice(1)) pdf += String(pos).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
export function downloadPaymentReceipt(row: SettledPayment, merchantName: string): void {
  const bytes = receiptPdf(row, merchantName);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = `orbit-receipt-${row.txHash.slice(0, 12)}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
