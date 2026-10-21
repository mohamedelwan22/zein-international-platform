import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { SEO_PAGE_KEYS, type SeoPageKey } from "@/lib/seo-pages";
import {
  getSeoTargets,
  listSeoMeta,
  listSlugRedirects,
  type SeoTargetEntity,
} from "@/server/services/seo";
import {
  SeoEditor,
  type SeoEditorRow,
  type SeoEditorTarget,
  type SeoTargetGroup,
} from "@/components/admin/seo-editor";

/**
 * Admin SEO module (US10, T104/T105, admin-api.md §7, FR-043).
 *
 * Enforces `seo:read` server-side (this static route shadows the shared
 * `[...section]` guard) and renders the target/locale editor. Redirect
 * management and save controls only appear for `seo:update`; the API
 * re-enforces both permissions.
 */

export const instant = false;

const PAGE_LABEL_KEYS: Record<SeoPageKey, string> = {
  home: "seoPageHome",
  about: "seoPageAbout",
  brands: "seoPageBrands",
  products: "seoPageProducts",
  suppliers: "seoPageSuppliers",
  clients: "seoPageClients",
  contact: "seoPageContact",
  "geographic-presence": "seoPageGeographicPresence",
  innovation: "seoPageInnovation",
  partnership: "seoPagePartnership",
  sustainability: "seoPageSustainability",
  values: "seoPageValues",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("seo"), robots: { index: false, follow: false } };
}

function entityTarget(
  group: Exclude<SeoTargetGroup, "pages">,
  type: "brand" | "product" | "supplier" | "category",
  entity: SeoTargetEntity,
  locale: "en" | "ar",
): SeoEditorTarget {
  return {
    key: `${type}:${entity.id}`,
    label: (locale === "ar" ? entity.nameAr : entity.nameEn) || entity.nameEn,
    group,
    status: entity.status,
    slugs: { en: entity.slugEn ?? "", ar: entity.slugAr ?? "" },
  };
}

export default async function SeoAdminPage({
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

  if (!user || !hasPermission(user.role, "seo:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const canUpdate = hasPermission(user.role, "seo:update");
  const [targets, rows, redirects] = await Promise.all([
    getSeoTargets(),
    listSeoMeta(),
    canUpdate ? listSlugRedirects() : Promise.resolve([]),
  ]);

  const editorTargets: SeoEditorTarget[] = [
    ...SEO_PAGE_KEYS.map((pageKey) => ({
      key: `page:${pageKey}`,
      label: t(PAGE_LABEL_KEYS[pageKey] as never),
      group: "pages" as const,
      slugs: null,
    })),
    ...targets.brands.map((entity) => entityTarget("brands", "brand", entity, locale)),
    ...targets.products.map((entity) => entityTarget("products", "product", entity, locale)),
    ...targets.suppliers.map((entity) =>
      entityTarget("suppliers", "supplier", entity, locale),
    ),
    ...targets.categories.map((entity) =>
      entityTarget("categories", "category", entity, locale),
    ),
  ];

  const editorRows: SeoEditorRow[] = rows.map((row) => ({
    targetType: row.targetType,
    targetId: row.targetId,
    pageKey: row.pageKey,
    locale: row.locale,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    canonicalUrl: row.canonicalUrl,
    slugOverride: row.slugOverride,
    ogImageMediaId: row.ogImageMediaId,
    ogImageUrl: row.ogImageUrl,
    noindex: row.noindex,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <SeoEditor
      targets={editorTargets}
      rows={editorRows}
      redirects={redirects.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }))}
      canUpdate={canUpdate}
    />
  );
}
