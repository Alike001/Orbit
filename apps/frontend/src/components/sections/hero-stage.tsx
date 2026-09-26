"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReceiptPanel } from "./interactive-panels/receipt-panel";
import { UsagePanel } from "./interactive-panels/usage-panel";
import { RetainerPanel } from "./interactive-panels/retainer-panel";
import { CheckoutPanel } from "./interactive-panels/checkout-panel";
import { PayrollPanel } from "./interactive-panels/payroll-panel";

const PANELS = [ReceiptPanel, UsagePanel, RetainerPanel, CheckoutPanel, PayrollPanel];

export function HeroStage() {
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % PANELS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const ActivePanel = PANELS[activeTab];

  return (
    <div className="relative w-full min-h-[440px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <ActivePanel />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
