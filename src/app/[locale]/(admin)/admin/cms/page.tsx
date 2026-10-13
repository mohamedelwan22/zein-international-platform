import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { getOrCreateCmsSection } from "@/server/services/cms";
import { CMS_SECTION_KEYS } from "@/server/validation/cms";
import { CmsSectionEditor, type CmsSectionData } from "@/components/admin/cms-section-editor";

/**
 * Admin CMS module (US6, T070, admin-api.md §6).
 *
 * Enforces `cms:read` server-side (the static route shadows the shared
 * `[...section]` guard), then loads every fixed registry row
 * (home|about|contact × en|ar), creating missing rows the same way the API
 * `GET` does. Edit/publish controls are only rendered for roles holding
 * `cms:update` / `cms:publish`; the API re-enforces every write regardless.
 */

export const instant = false;

const LOCALES: readonly AppLocale[] = ["en", "ar"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("cms"), robots: { index: false, follow: false } };
}

export default async function CmsAdminPage({
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

  if (!user || !hasPermission(user.role, "cms:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const sections: CmsSectionData[] = [];
  for (const sectionKey of CMS_SECTION_KEYS) {
    for (const sectionLocale of LOCALES) {
      const row = await getOrCreateCmsSection(sectionKey, sectionLocale, user.id);
      sections.push({
        sectionKey,
        locale: sectionLocale,
        draftContent: row.draftContent,
        publishedContent: row.publishedContent,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      });
    }
  }

  return (
    <CmsSectionEditor
      sections={sections}
      canUpdate={hasPermission(user.role, "cms:update")}
      canPublish={hasPermission(user.role, "cms:publish")}
    />
  );
}
