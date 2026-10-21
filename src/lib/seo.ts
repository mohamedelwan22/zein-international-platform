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

/**
 * Approved staff overrides stored in `SeoMeta` (US10, FR-043). Every field is
 * optional: a missing value falls back to the localized default derived from
 * the record/CMS content (US10.2), so SEO never requires re-entering content.
 */
export interface SeoOverride {
  title?: string | null;
  description?: string | null;
  /** Absolute URL or a site-relative path ("/en/about"). */
  canonicalUrl?: string | null;
  /** Public media URL (or path) for the Open Graph image. */
  ogImageUrl?: string | null;
  noindex?: boolean;
}

function resolveCanonical(value: string, siteUrl: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${siteUrl}/${trimmed.replace(/^\/+/, "")}`;
}

export interface PublicMetadataInput {
  locale: AppLocale;
  /** Route path without the locale prefix, always starting with "/" (e.g. "/about"). */
  path: string;
  /** Localized page title (approved content or UI chrome). */
  title: string;
  /** Localized description derived from approved content. */
  description: string;
  /** Approved `SeoMeta` overrides for this locale (US10). */
  seo?: SeoOverride | null;
  /** Omit on localized utility pages that should not be indexed twice. */
  noindex?: boolean;
  /**
   * Per-locale path overrides for the `hreflang` alternates, for routes whose
   * slug differs by locale (detail pages, BUG-002). Keys omit the locale
   * prefix; any locale left out falls back to `path`.
   */
  languagePaths?: Partial<Record<AppLocale, string>>;
}

export function buildPublicMetadata({
  locale,
  path,
  title,
  description,
  seo,
  noindex = false,
  languagePaths,
}: PublicMetadataInput): Metadata {
  const enPath = languagePaths?.en ?? path;
  const arPath = languagePaths?.ar ?? path;
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const company = COMPANY[locale];
  const canonical = seo?.canonicalUrl
    ? resolveCanonical(seo.canonicalUrl, siteUrl)
    : `${siteUrl}/${locale}${path === "/" ? "" : path}`;

  // Staff overrides are exact: they bypass the localized title template and
  // the 160-character truncation is only a defensive cap (validation already
  // enforces it). Missing overrides fall back to the localized defaults.
  const overrideTitle = seo?.title?.trim() ? seo.title.trim() : null;
  const finalDescription = seo?.description?.trim() ? seo.description.trim() : description;
  // The root layout's title template appends "| Company" per locale; the
  // home page composes its full title directly.
  const fullTitle =
    overrideTitle ??
    (path === "/" ? `${company} — ${title}` : `${title} | ${company}`);
  const image = seo?.ogImageUrl
    ? { url: seo.ogImageUrl }
    : { url: "/hero.png", width: 2001, height: 786 };

  return {
    metadataBase: new URL(siteUrl),
    title: overrideTitle
      ? { absolute: fullTitle }
      : path === "/"
        ? { absolute: fullTitle }
        : title,
    description: truncateMetaDescription(finalDescription),
    alternates: {
      canonical,
      languages: {
        en: `${siteUrl}/en${enPath === "/" ? "" : enPath}`,
        ar: `${siteUrl}/ar${arPath === "/" ? "" : arPath}`,
      },
    },
    openGraph: {
      type: "website",
      title: fullTitle,
      description: truncateMetaDescription(finalDescription),
      url: canonical,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      images: [image],
    },
    robots: noindex || seo?.noindex ? { index: false, follow: false } : undefined,
  };
}
