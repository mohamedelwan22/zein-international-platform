import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { EntityAdmin } from "@/components/admin/entity-admin";

/**
 * Categories admin module (US7, T078, FR-027, admin-api.md §3).
 *
 * Typed by `kind` (brand|product|supplier); parent depth ≤ 2 is enforced by the
 * service. Reorder via `sortOrder`; activate/deactivate via visibility.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("categories"), robots: { index: false, follow: false } };
}

export default async function AdminCategoriesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <EntityAdmin resource="categories" locale={locale} query={await searchParams} />;
}
