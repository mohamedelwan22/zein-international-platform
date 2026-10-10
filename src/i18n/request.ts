import { getRequestConfig } from "next-intl/server";
import { isAppLocale, routing } from "./routing";

/**
 * Per-request locale + messages (T020).
 * An unknown/missing locale falls back to the default locale — never a
 * broken page (spec edge case "localized field has no Arabic or English
 * value", Constitution VI).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : routing.defaultLocale;

  const messages = (await import(`./messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    // ICU timezone stays default; the app renders approved content only.
  };
});
