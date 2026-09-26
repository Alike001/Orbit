"use client";

import { motion } from "framer-motion";

export function ReceiptPanel() {
  return (
    <div
      className="hero-visual receipt-visual"
      aria-label="Orbit recurring pull receipt animation"
    >
      <div className="visual-meta">
        <span className="text-white/80 font-bold">ALLOWANCE VAULT</span>
      </div>

      <div className="receipt-stage">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="receipt-card"
        >
          <div className="receipt-head">
            <span className="receipt-logo">
              <span />
            </span>
            <strong className="tracking-wider">ORBIT PROTOCOL</strong>
            <span className="text-white/60 text-[10px]">Auto-settled · 0.4s</span>
          </div>

          <div className="receipt-order">
            <span>Order #A84-7821</span>
            <span className="text-white/90 font-semibold">AUTOMATED PULL SETTLEMENT</span>
          </div>

          <div className="receipt-line">
            <span>Pro plan · monthly</span>
            <strong>$49.00</strong>
          </div>
          <div className="receipt-line">
            <span>API credits · 25k req</span>
            <strong>$12.50</strong>
          </div>
          <div className="receipt-line">
            <span>Seat · 1 additional</span>
            <strong>$3.20</strong>
          </div>

          <div className="receipt-subtotal">
            <span>Subtotal</span>
            <strong>$64.70</strong>
          </div>
          <div className="receipt-tax">
            <span>Network gas · On-chain</span>
            <strong>$0.001</strong>
          </div>

          <div className="receipt-total">
            <span>TOTAL PULLED</span>
            <strong className="flex items-center gap-2">
              <span className="line-through text-white/40 text-xs font-normal">$0.00</span>
              <span className="text-white text-base">$70.40 USDC</span>
            </strong>
          </div>

          <div className="receipt-foot">
            <span>vault · 0x4f42…b819</span>
            <span>allowance rule: ≤ $100/30d</span>
          </div>

          {/* Animated Stamp */}
          <motion.div
            initial={{ scale: 2.2, opacity: 0, rotate: -25 }}
            animate={{ scale: 1, opacity: 0.95, rotate: -12 }}
            transition={{ type: "spring", stiffness: 350, damping: 20, delay: 0.2 }}
            className="receipt-stamp select-none"
          >
            PAID
          </motion.div>
        </motion.div>
      </div>

      <div className="visual-caption">
        <span>70.40 USDC</span>
        <span>every 30 days / pull executed on schedule</span>
      </div>
    </div>
  );
}
