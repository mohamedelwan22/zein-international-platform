import type { ReactNode } from "react";

/**
 * Page container (DESIGN_SYSTEM §11 — max-width 1440px, fluid inline
 * padding). All public sections compose inside it.
 */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`container-main ${className}`}>{children}</div>;
}
