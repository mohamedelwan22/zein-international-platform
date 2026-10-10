import type { Metadata } from "next";
import { env } from "@/lib/env";
import type { AppLocale } from "@/i18n/routing";

/**
 * Public SEO foundation (T037, FR-043, SC-011).
 *
 * Every public route composes its per-locale metadata through this helper:
 * localized title/description derived from approved content, an explicit
 * canonical URL, hreflang alternates for en/ar, and Open Graph tags using
 * the approved hero asset. US10 layers SeoMeta overrides on top of these
 * localized defaults (US10.2 fallback behavior).
 */

const COMPANY = {
  en: "Zain International Trading",
  ar: "وكالة زين للتجارة العالمية",
} as const;

/** Meta descriptions stay within the 160-character guidance (data-model §2.10). */
const META_DESCRIPTION_MAX = 160;

export function truncateMetaDescription(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= META_DESCRIPTION_MAX) return clean;
  const cut = clean.slice(0, META_DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 100 ? lastSpace : META_DESCRIPTION_MAX - 1).trimEnd()}…`;
}

export interface PublicMetadataInput {
  locale: AppLocale;
  /** Route path without the locale prefix, always starting with "/" (e.g. "/about"). */
  path: string;
  /** Localized page title (approved content or UI chrome). */
  title: string;
  /** Localized description derived from approved content. */
  description: string;
  /** Omit on localized utility pages that should not be indexed twice. */
  noindex?: boolean;
}

export function buildPublicMetadata({
  locale,
  path,
  title,
  description,
  noindex = false,
}: PublicMetadataInput): Metadata {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const company = COMPANY[locale];
  const canonical = `${siteUrl}/${locale}${path === "/" ? "" : path}`;
  // The root layout's title template appends "| Company" per locale; the
  // home page composes its full title directly.
  const fullTitle = path === "/" ? `${company} — ${title}` : `${title} | ${company}`;

  return {
    metadataBase: new URL(siteUrl),
    title: path === "/" ? { absolute: fullTitle } : title,
    description: truncateMetaDescription(description),
    alternates: {
      canonical,
      languages: {
        en: `${siteUrl}/en${path === "/" ? "" : path}`,
        ar: `${siteUrl}/ar${path === "/" ? "" : path}`,
      },
    },
    openGraph: {
      type: "website",
      title: fullTitle,
      description: truncateMetaDescription(description),
      url: canonical,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      images: [{ url: "/hero.png", width: 2001, height: 786 }],
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
