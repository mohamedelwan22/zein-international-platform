import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { EntityAdmin } from "@/components/admin/entity-admin";

/**
 * Suppliers admin module (US7, T079, FR-028/FR-011, admin-api.md §3).
 *
 * Bilingual profile, categories, contact info and the public `disclosureApproved`
 * control: a supplier only appears publicly when published, visible AND
 * disclosure-approved.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("suppliers"), robots: { index: false, follow: false } };
}

export default async function AdminSuppliersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <EntityAdmin resource="suppliers" locale={locale} query={await searchParams} />;
}
