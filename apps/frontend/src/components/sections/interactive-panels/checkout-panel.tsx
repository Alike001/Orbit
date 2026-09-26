"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export function CheckoutPanel() {
  const [isApproved, setIsApproved] = useState(false);

  return (
    <div className="hero-visual" aria-label="Global checkout panel">
      <div className="visual-meta">
        <span className="text-white/80 font-bold">EMBEDDED CHECKOUT WIDGET</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="interface-panel checkout-interface"
      >
        <div className="checkout-top">
          <span className="mono">ORBIT CHECKOUT SDK</span>
          <span className="status-pill font-mono bg-white/10">ON-CHAIN READY</span>
        </div>

        <div className="checkout-brand font-sans">
          Pro Member
          <br />
          <span className="text-white/60 font-light text-2xl">Community & Resources</span>
        </div>

        <div className="checkout-line">
          <span>Membership tier</span>
          <strong>12 USDC</strong>
        </div>
        <div className="checkout-line">
          <span>Billing cycle</span>
          <strong>Every 30 days</strong>
        </div>
        <div className="checkout-line">
          <span>Allowance cap</span>
          <strong>12 USDC max / cycle</strong>
        </div>

        <button
          className={`checkout-button transition-all duration-300 ${
            isApproved
              ? "bg-green-500 text-black border-green-500"
              : "bg-white text-black hover:bg-neutral-200"
          }`}
          type="button"
          onClick={() => setIsApproved((prev) => !prev)}
        >
          {isApproved ? (
            <>
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} /> Allowance Granted
              </span>
              <span className="font-mono text-[10px]">PULL READY</span>
            </>
          ) : (
            <>
              <span>Approve on-chain allowance</span>
              <ArrowUpRight size={15} />
            </>
          )}
        </button>

        <span className="checkout-note text-white/50">
          Connected via Web3 wallet · Sign once, subscribe friction-free
        </span>
      </motion.div>

      <div className="visual-caption">
        <span>12 USDC / month</span>
        <span>1-click recurring permission · non-custodial</span>
      </div>
    </div>
  );
}
