"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { motion } from "framer-motion";

export function PayrollPanel() {
  const totalRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const obj = { val: 0 };
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: 1200,
        duration: 1.3,
        ease: "power2.out",
        onUpdate: () => {
          if (totalRef.current) {
            totalRef.current.textContent = `${Math.floor(obj.val).toLocaleString()} USDC`;
          }
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="hero-visual" aria-label="Global batch payroll panel">
      <div className="visual-meta">
        <span className="text-white/80 font-bold">BATCH DISBURSEMENT</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="interface-panel payroll-interface"
      >
        <div className="panel-heading">
          <span className="mono">FRIDAY GLOBAL PAYROLL</span>
          <span className="status-pill font-mono bg-white/10">3 RECIPIENTS · 1 TX</span>
        </div>

        <div className="payroll-row">
          <span className="recipient-dot">FE</span>
          <span>
            <strong>Frontend Engineer</strong>
            <small>Ghana · wallet …8f2a</small>
          </span>
          <b>400 USDC</b>
        </div>

        <div className="payroll-row">
          <span className="recipient-dot">SC</span>
          <span>
            <strong>Smart Contract Dev</strong>
            <small>India · wallet …11c9</small>
          </span>
          <b>600 USDC</b>
        </div>

        <div className="payroll-row">
          <span className="recipient-dot">CM</span>
          <span>
            <strong>Community Lead</strong>
            <small>Brazil · wallet …a04d</small>
          </span>
          <b>200 USDC</b>
        </div>

        <div className="payroll-total">
          <span>ONE LEDGER EXECUTION BLOCK</span>
          <strong ref={totalRef} className="font-mono text-base text-white">
            1,200 USDC
          </strong>
        </div>
      </motion.div>

      <div className="visual-caption">
        <span>1,200 USDC total</span>
        <span>15 countries · single signature disbursement</span>
      </div>
    </div>
  );
}
