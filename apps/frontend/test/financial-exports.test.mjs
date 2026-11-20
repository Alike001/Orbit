import assert from "node:assert/strict";
import test from "node:test";
import { financialCsv, explorerTransactionUrl, receiptPdf, selectSettledPayments, decimalUsdc, ledgerFinancialCsv } from "../src/lib/financial-exports.ts";

const hash = "a".repeat(64);
const sample = {
  ledgerSequence: 1234, txHash: hash,
  customerAddress: "G" + "A".repeat(55), planName: 'Pro "Starter",\nMonthly',
  grossUsdc: 25.5, networkFee: 0.00001,
  settledAt: "2026-11-19T12:30:00.000Z", network: "testnet",
};
test("financial CSV is RFC4180 formatted with stable headers and escaped cells", () => {
  const csv = financialCsv([sample]);
  assert.equal(csv.split("\r\n")[0], "Ledger Sequence,Tx Hash,Customer Address,Plan Name,Gross Amount (USDC),Network Fee,Settlement Timestamp");
  assert.match(csv, /"Pro ""Starter"",\nMonthly"/);
  assert.match(csv, /25\.5000000,0\.0000100/);
  assert.ok(csv.endsWith("\r\n"));
});
test("financial CSV neutralizes spreadsheet formulas", () => {
  const csv = financialCsv([{ ...sample, planName: "=HYPERLINK(\"https://evil.example\")" }]);
  assert.ok(csv.includes("'=HYPERLINK"));
});
test("date and plan filters select matching settlements", () => {
  assert.deepEqual(selectSettledPayments([sample], { from: "2026-11-19", to: "2026-11-19", plan: sample.planName }), [sample]);
  assert.deepEqual(selectSettledPayments([sample], { from: "2026-11-20" }), []);
});
test("explorer links follow the selected Stellar network", () => {
  assert.equal(explorerTransactionUrl(sample), `https://stellar.expert/explorer/testnet/tx/${hash}`);
  assert.equal(explorerTransactionUrl({ ...sample, network: "public" }), `https://stellar.expert/explorer/public/tx/${hash}`);
  assert.throws(() => explorerTransactionUrl({ ...sample, txHash: "fake" }));
});
test("receipt generator produces a PDF containing the verified transaction", () => {
  const pdf = new TextDecoder().decode(receiptPdf(sample, "Merchant"));
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.includes(hash));
  assert.ok(pdf.includes("Merchant"));
  assert.ok(pdf.includes("%%EOF"));
});

test("merchant ledger export uses precise USDC units and leaves unavailable accounting metadata blank", () => {
  assert.equal(decimalUsdc("255000001"), "25.5000001");
  const csv = ledgerFinancialCsv([{
    plan_id: "plan-1", transaction_hash: hash, customer_wallet: sample.customerAddress,
    amount_usdc_units: "255000001", settled_at: sample.settledAt,
  }], new Map(), new Map([["plan-1", "Pro, Monthly"]]));
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "Ledger Sequence,Tx Hash,Customer Address,Plan Name,Gross Amount (USDC),Network Fee,Settlement Timestamp");
  assert.ok(lines[1].startsWith("," + hash + ","));
  assert.ok(lines[1].includes('"Pro, Monthly",25.5000001,,'));
});
