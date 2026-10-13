import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { getAllSettings } from "@/server/services/settings";
import { SettingsEditor, type SettingsData } from "@/components/admin/settings-editor";

/**
 * Admin Settings module (US6, T070, admin-api.md §9, FR-014).
 *
 * Enforces `settings:read` server-side (the static route shadows the shared
 * `[...section]` guard) and renders the four supported keys as typed bilingual
 * fields. The save control only appears for roles holding `settings:update`;
 * `PUT /api/admin/settings/{key}` re-enforces it server-side.
 */

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("settings"), robots: { index: false, follow: false } };
}

export default async function SettingsAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [t, tErrors] = await Promise.all([
    getTranslations("admin"),
    getTranslations("errors"),
  ]);
  const user = await getSessionUser();

  if (!user || !hasPermission(user.role, "settings:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const rows = await getAllSettings();
  const settings: SettingsData[] = rows.map((row) => ({
    key: row.key,
    valueEn: row.valueEn,
    valueAr: row.valueAr,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return <SettingsEditor settings={settings} canUpdate={hasPermission(user.role, "settings:update")} />;
}
