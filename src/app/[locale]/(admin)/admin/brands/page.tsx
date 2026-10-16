import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { EntityAdmin } from "@/components/admin/entity-admin";

/**
 * Brands admin module (US7, T076, FR-025, admin-api.md §3).
 *
 * Static route shadows the shared `[...section]` guard so the module owns its
 * own server-side `brands:read` enforcement (in `EntityAdmin`) and renders the
 * reusable manager. All writes re-check permission in `services/admin.ts`.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("brands"), robots: { index: false, follow: false } };
}

export default async function AdminBrandsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <EntityAdmin resource="brands" locale={locale} query={await searchParams} />;
}
