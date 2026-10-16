import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { EntityAdmin } from "@/components/admin/entity-admin";

/**
 * Clients admin module (US7, T080, FR-029/FR-012, admin-api.md §3).
 *
 * Confidential by default (`disclosureApproved` false): the public directory
 * only ever serves a client when it is published, visible AND disclosure-
 * approved, so confidential client details never leak (data-model §2.6).
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("clients"), robots: { index: false, follow: false } };
}

export default async function AdminClientsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <EntityAdmin resource="clients" locale={locale} query={await searchParams} />;
}
