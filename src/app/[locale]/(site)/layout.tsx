import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { loadContactInfo, loadCurrentYear } from "@/server/cache/public-content";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";

/**
 * Public site shell (T033, FR-040): skip link, semantic landmarks
 * (header/nav, main, footer), and the footer's approved contact details.
 * The layout itself stays uncached; its data reads flow through the cached
 * loaders so the shell participates in static prerendering.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [t, contact, year] = await Promise.all([
    getTranslations("common"),
    loadContactInfo(locale),
    loadCurrentYear(),
  ]);

  return (
    <>
      <a
        href="#main-content"
        className="skip-link rounded-sm bg-zain-cream-50 px-4 py-3 text-body font-semibold text-zain-green-950"
      >
        {t("skipToContent")}
      </a>
      <Navbar />
      <main id="main-content">{children}</main>
      <SiteFooter contact={contact} year={year} />
    </>
  );
}
