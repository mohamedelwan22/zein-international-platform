import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "./container";

export interface SectionHeadingProps {
  /** Message key path under the active namespace, e.g. "missionTitle". */
  titleKey: string;
  /** Message namespace that holds titleKey. */
  namespace: string;
  /** Optional eyebrow label above the title (gold accent on dark sections). */
  eyebrow?: string;
  /** Set when the heading sits on a dark section (gold/cream treatment). */
  onDark?: boolean;
  /** Align the heading block to the center instead of the inline start. */
  alignCenter?: boolean;
  /** Optional link rendered at the inline-end of the heading row. */
  link?: { href: string; label: string };
}

/**
 * Section heading — display-serif title with an optional gold eyebrow
 * (DESIGN_SYSTEM §8/§14). Pure structural chrome; all business copy is
 * rendered around it from CMS content.
 */
export function SectionHeading({
  titleKey,
  namespace,
  eyebrow,
  onDark = false,
  alignCenter = false,
  link,
}: SectionHeadingProps) {
  const t = useTranslations(namespace);

  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-6 ${
        alignCenter ? "flex-col items-center text-center" : ""
      }`}
    >
      <div className={alignCenter ? "text-center" : ""}>
        {eyebrow ? (
          <p
            className={`text-meta font-semibold uppercase tracking-wide ${
              onDark ? "text-zain-gold-400" : "text-zain-green-700"
            }`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={`mt-2 font-display text-h2 font-medium ${
            onDark ? "text-zain-cream-50" : "text-zain-green-950"
          }`}
        >
          {t(titleKey)}
        </h2>
      </div>
      {link ? (
        <Link
          href={link.href}
          className={`inline-flex min-h-11 items-center gap-2 text-body font-semibold underline-offset-4 hover:underline ${
            onDark ? "text-zain-gold-400" : "text-zain-green-700"
          }`}
        >
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Full-width section wrapper with container alignment. */
export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={className}>
      <Container>{children}</Container>
    </section>
  );
}
