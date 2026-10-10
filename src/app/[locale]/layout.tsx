import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Amiri, Cormorant_Garamond, IBM_Plex_Sans_Arabic, Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { dirForLocale, isAppLocale, routing } from "@/i18n/routing";
import "../globals.css";

/**
 * Root layout (T021/T022): per-locale <html lang dir>, self-hosted fonts via
 * next/font (no layout shift, FR-042), and the logical-properties baseline
 * from globals.css. Locale detection/redirect lives in src/proxy.ts.
 *
 * Fonts (plan decision, DESIGN_SYSTEM §8 — two-family split, first-class
 * Arabic typography): Cormorant Garamond (Latin display), Manrope (Latin UI),
 * Amiri (Arabic display), IBM Plex Sans Arabic (Arabic UI).
 */

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

const plexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-ibm-plex-sans-arabic",
  display: "swap",
});

const fontVariables = [
  cormorant.variable,
  manrope.variable,
  amiri.variable,
  plexSansArabic.variable,
].join(" ");

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
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

  return (
    <html lang={locale} dir={dirForLocale(locale)}>
      <body className={fontVariables}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
