"use client";

import { motion, useReducedMotion } from "motion/react";
import { springs } from "@/components/motion";

/** Page transition between app screens -- re-mounts on every navigation. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={reduce ? { duration: 0.15 } : springs.default}
    >
      {children}
    </motion.div>
  );
}
