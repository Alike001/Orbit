"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { motion } from "framer-motion";
import { DOCS_URL } from "@/lib/links";

const CODE_SNIPPET = `// 1. Initialize Orbit SDK with your merchant keys
import { Orbit } from '@orbit/sdk';

const orbit = new Orbit({
  merchantId: 'merch_8812f',
});

// 2. Prompt customer to approve protected Allowance Vault
const vault = await orbit.allowance.create({
  asset: 'USDC',
  amount: '29.00',
  period: '30d',
  cap: '29.00',
});

// Response:
// ✓ Vault approved: 0x4f42…b819
// ✓ Handshake locked / Recurring pull ready`;

export function DeveloperSdk() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CODE_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  return (
    <section className="code-section">
      <div className="orbit-container code-grid">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">
            Keep your product moving. Let the protocol handle the pull.
          </h2>
          <p className="section-body">
            Start with a checkout widget, an allowance approval, and a clear
            execution response. The Orbit SDK is built around the flows you
            actually ship.
          </p>
          <Link
            className="button button-primary button-arrow mt-8"
            href={`${DOCS_URL}/checkout/widget`}
            data-testid="code-button-docs"
          >
            Explore the SDK
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="code-window"
          aria-label="Orbit SDK allowance example"
        >
          <div className="code-bar">
            <span>create-allowance.ts — orbit / sdk</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10"
              aria-label="Copy code to clipboard"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-green-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="code-content">
            <code>
              <span className="syntax-dim">01</span>{"  "}
              <span className="syntax-dim">{"// Initialize Orbit SDK"}</span>
              {"\n"}
              <span className="syntax-dim">02</span>{"  "}
              <span className="syntax-white">const</span> vault ={" "}
              <span className="syntax-white">await</span> orbit.allowance.
              <span className="syntax-bold">create</span>({"{"}
              {"\n"}
              <span className="syntax-dim">03</span>{"    "}
              <span className="syntax-key">asset</span>:{" "}
              <span className="syntax-string">&apos;USDC&apos;</span>,
              {"\n"}
              <span className="syntax-dim">04</span>{"    "}
              <span className="syntax-key">amount</span>:{" "}
              <span className="syntax-string">&apos;29.00&apos;</span>,
              {"\n"}
              <span className="syntax-dim">05</span>{"    "}
              <span className="syntax-key">every</span>:{" "}
              <span className="syntax-string">&apos;30d&apos;</span>,
              {"\n"}
              <span className="syntax-dim">06</span>{"    "}
              <span className="syntax-key">cap</span>:{" "}
              <span className="syntax-string">&apos;29.00&apos;</span>,
              {"\n"}
              <span className="syntax-dim">07</span>{"  "}
              {"});"}
              {"\n\n"}
              <span className="syntax-dim">08</span>{"  "}
              <span className="syntax-response">
                ✓ vault approved · on-chain ledger block · pull ready
              </span>
            </code>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
