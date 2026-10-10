"use client";

import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { isAppLocale, type AppLocale } from "@/i18n/routing";

/**
 * Language switch (T033, FR-001, SC-001): ONE action switches the full
 * experience between English and Arabic while preserving the current
 * location — including query parameters (ready for US2 catalog filters).
 * The active language renders as marked text (no self-link); locale-native
 * labels ("English" / "العربية") stay identical in both locales so the
 * switch is always recognizable.
 */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const t = useTranslations("languageSwitch");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeLocale = useLocale();
  const active: AppLocale = isAppLocale(activeLocale) ? activeLocale : "en";
  const other: AppLocale = active === "en" ? "ar" : "en";

  const query = searchParams.toString();
  const href = `${pathname}${query ? `?${query}` : ""}`;

  return (
    <nav aria-label={t("label")} className={`flex items-center gap-1.5 ${className}`}>
      <span aria-current="true" className="min-h-11 py-2 text-zain-gold-400">
        <span className="text-meta font-semibold">{t(active)}</span>
      </span>
      <span aria-hidden="true" className="text-zain-cream-50/40">
        /
      </span>
      <Link
        href={href}
        locale={other}
        lang={other}
        className="inline-flex min-h-11 items-center rounded-sm px-1.5 text-meta font-semibold text-zain-cream-50 transition-colors hover:text-zain-gold-400"
      >
        {t(other)}
      </Link>
    </nav>
  );
}
