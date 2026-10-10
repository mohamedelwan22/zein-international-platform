import { defineRouting } from "next-intl/routing";

/**
 * Locale routing (T020, FR-001–FR-004).
 *
 * `localePrefix: "always"` keeps every locale explicitly addressable
 * (/en/…, /ar/…) — required for hreflang alternates and per-locale
 * canonical URLs (SC-011).
 */
export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

export const LOCALES = routing.locales as readonly [AppLocale, ...AppLocale[]];

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

export function dirForLocale(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
