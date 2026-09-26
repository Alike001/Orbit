"use client";

import { useEffect, useRef } from "react";
import { Check, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { motion } from "framer-motion";

export function RetainerPanel() {
  const amountRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const obj = { val: 0 };
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: 2000,
        duration: 1.4,
        ease: "power2.out",
        onUpdate: () => {
          if (amountRef.current) {
            amountRef.current.textContent = `$${Math.floor(obj.val).toLocaleString()}`;
          }
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="hero-visual" aria-label="Monthly retainer pull panel">
      <div className="visual-meta">
        <span className="text-white/80 font-bold">RETAINER PULL</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="interface-panel retainer-interface"
      >
        <div className="panel-heading">
          <span className="mono">ALLOWANCE VAULT / ACTIVE</span>
          <span className="vault-ring font-mono">01</span>
        </div>

        <div className="retainer-parties">
          <div>
            <span>CLIENT (PAYER)</span>
            <strong>Fintech Labs / London</strong>
          </div>
          <div className="flex items-center justify-center text-white/50 px-2">
            <ArrowRight size={16} />
          </div>
          <div>
            <span>STUDIO (PAYEE)</span>
            <strong>Apex Design / Kenya</strong>
          </div>
        </div>

        <div className="retainer-amount">
          <strong ref={amountRef}>$2,000</strong>
          <span>USDC / month</span>
        </div>

        <div className="limit-grid">
          <span>
            Monthly Cap Enforced
            <strong>2,000 USDC maximum</strong>
          </span>
          <span>
            Next Scheduled Pull
            <strong>In 12 days (auto)</strong>
          </span>
        </div>

        <div className="pull-action mt-5 bg-white/[0.04]">
          <span>ONE ALLOWANCE APPROVAL. RECURRING REVENUE.</span>
          <Check size={16} className="text-green-400" />
        </div>
      </motion.div>

      <div className="visual-caption">
        <span>2,000 USDC</span>
        <span>time + budget limits protected on-chain</span>
      </div>
    </div>
  );
}
