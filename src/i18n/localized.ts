import type { AppLocale } from "./routing";

/**
 * Localized-field fallback (T027 / spec edge case, Constitution VI):
 * when a localized value is missing in the active language, fall back to the
 * available approved variant — never a broken layout, and the fallback is
 * flagged so staff can complete the translation. If neither locale has a
 * value, return null so the caller hides the optional element.
 */
export interface LocalizedText {
  en?: string | null;
  ar?: string | null;
}

export interface LocalizedPick {
  text: string;
  /** The locale the returned text is actually in (may differ from active). */
  locale: AppLocale;
  /** True when the active locale's value was missing and we fell back. */
  fallbackUsed: boolean;
}

export function pickLocalized(
  locale: AppLocale,
  value: LocalizedText | null | undefined,
): LocalizedPick | null {
  if (!value) return null;

  const active = value[locale];
  if (typeof active === "string" && active.trim().length > 0) {
    return { text: active, locale, fallbackUsed: false };
  }

  const other: AppLocale = locale === "en" ? "ar" : "en";
  const fallback = value[other];
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return { text: fallback, locale: other, fallbackUsed: true };
  }

  return null;
}
