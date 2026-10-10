"use client";

import type { ReactNode } from "react";
import { motion, MotionConfig } from "framer-motion";

/**
 * Restrained entrance motion (DESIGN_SYSTEM §15: cinematic, restrained,
 * expensive). Used for the single orchestrated hero moment — small
 * translate (0 → 24px), slow fade, quiet easing.
 *
 * `MotionConfig reducedMotion="user"` makes Framer Motion skip transform
 * animations for users who prefer reduced motion. The initial styles stay
 * deterministic so server and client hydration always match (no
 * useReducedMotion branching in the render output).
 */
export function FadeIn({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
        className={className}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
