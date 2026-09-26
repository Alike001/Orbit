"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { motion } from "framer-motion";

export function UsagePanel() {
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const obj = { val: 0.0 };
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: 0.45,
        duration: 1.2,
        ease: "power2.out",
        onUpdate: () => {
          if (countRef.current) {
            countRef.current.textContent = `$${obj.val.toFixed(2)}`;
          }
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="hero-visual" aria-label="AI usage settlement panel">
      <div className="visual-meta">
        <span className="text-white/80 font-bold">USAGE SETTLEMENT</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="interface-panel usage-interface"
      >
        <div className="panel-heading">
          <span className="mono">WEEKLY INFERENCE RUN</span>
          <span className="status-pill font-mono bg-white/10 border-white/30">READY TO PULL</span>
        </div>

        <div className="usage-total">
          <strong ref={countRef}>$0.45</strong>
          <span>USDC</span>
        </div>

        <div className="metric-row">
          <span>Account</span>
          <strong>atlas-inference / pro</strong>
        </div>
        <div className="metric-row">
          <span>Requests</span>
          <strong>1,842 LLM tokens & calls</strong>
        </div>
        <div className="metric-row">
          <span>Billing Window</span>
          <strong>7 days elapsed</strong>
        </div>

        <motion.div
          whileHover={{ scale: 1.01 }}
          className="pull-action cursor-pointer hover:bg-white/10 transition-colors"
        >
          <span>ALLOWANCE WITHIN LIMIT · AUTOMATIC SETTLEMENT</span>
          <ArrowUpRight size={15} />
        </motion.div>
      </motion.div>

      <div className="visual-caption">
        <span>0.45 USDC</span>
        <span>no card minimums · micro-settlement supported</span>
      </div>
    </div>
  );
}
