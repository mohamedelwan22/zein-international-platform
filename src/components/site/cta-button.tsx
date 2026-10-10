import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * CTA button (DESIGN_SYSTEM §14): premium, compact, strong typography,
 * subtle arrow (flips in RTL), refined hover, accessible focus. Both
 * variants hold 4.5:1+ text contrast on their surfaces.
 */

export interface CtaButtonProps {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  /** Styling context: sits on a dark section or a light one. */
  surface?: "dark" | "light";
  className?: string;
}

/** Content-shaped CTA reference (mirrors the CMS finalCta field shape). */
export interface CtaLink {
  href: string;
  label: string;
}

export function CtaButton({
  href,
  children,
  variant = "primary",
  surface = "dark",
  className = "",
}: CtaButtonProps) {
  const base =
    "group inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-6 py-3 text-body font-semibold transition-colors";

  const styles: Record<string, string> = {
    "primary-dark": "bg-zain-cream-50 text-zain-green-950 hover:bg-white",
    "secondary-dark":
      "border border-zain-cream-50/40 text-zain-cream-50 hover:border-zain-cream-50/70 hover:bg-white/5",
    "primary-light": "bg-zain-green-950 text-zain-cream-50 hover:bg-zain-green-900",
    "secondary-light":
      "border border-zain-green-950/25 text-zain-green-950 hover:border-zain-green-950/50 hover:bg-zain-green-950/5",
  };

  return (
    <Link href={href} className={`${base} ${styles[`${variant}-${surface}`]} ${className}`}>
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        fill="none"
        className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 rtl:-scale-x-100"
      >
        <path d="M5 12h14m0 0l-6-6m6 6l-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
