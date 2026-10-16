import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { EntityAdmin } from "@/components/admin/entity-admin";

/**
 * Products admin module (US7, T077, FR-026, admin-api.md §3).
 *
 * Brand is required (FK RESTRICT), categories ≥1, ordered images ≤10, bilingual
 * specs. Enforcement and validation live in the shared service layer.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("products"), robots: { index: false, follow: false } };
}

export default async function AdminProductsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <EntityAdmin resource="products" locale={locale} query={await searchParams} />;
}
