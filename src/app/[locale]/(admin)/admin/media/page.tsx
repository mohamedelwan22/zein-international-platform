import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { listMedia } from "@/server/services/media";
import { mediaListQuerySchema } from "@/server/validation/media";
import { MediaManager, type MediaRowData } from "@/components/admin/media-manager";

/**
 * Admin Media library (US12, T091, admin-api.md §5, FR-033).
 *
 * Enforces `media:read` server-side (the static route shadows the shared
 * `[...section]` guard). Filter tabs (all / images / documents / archived) map
 * to the list query; upload/archive/purge controls appear only for the
 * permissions the role holds, and the API re-enforces each one.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("media"), robots: { index: false, follow: false } };
}

export default async function AdminMediaPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser().catch(() => null);

  if (!user || !hasPermission(user.role, "media:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const query = await searchParams;
  const parsed = mediaListQuerySchema.safeParse({
    kind: firstParam(query.kind),
    archived: firstParam(query.archived),
    page: firstParam(query.page),
    pageSize: firstParam(query.pageSize),
  });
  const { kind, archived, page, pageSize } = parsed.success
    ? parsed.data
    : { kind: undefined, archived: false, page: 1, pageSize: 24 };

  const { items, total } = await listMedia({ kind, archived, page, pageSize });
  const rows: MediaRowData[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    mimeType: item.mimeType,
    byteSize: item.byteSize,
    originalName: item.originalName,
    altEn: item.altEn,
    altAr: item.altAr,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    url: item.url,
  }));

  const filters = [
    { key: "all", href: "/admin/media", label: t("mediaFilterAll"), active: !kind && !archived },
    {
      key: "image",
      href: "/admin/media?kind=image",
      label: t("mediaFilterImages"),
      active: kind === "image",
    },
    {
      key: "document",
      href: "/admin/media?kind=document",
      label: t("mediaFilterDocuments"),
      active: kind === "document",
    },
    {
      key: "archived",
      href: "/admin/media?archived=true",
      label: t("mediaFilterArchived"),
      active: archived,
    },
  ];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("media")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("mediaIntro")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label={t("mediaFilterLabel")}>
        {filters.map((filter) => (
          <Link
            key={filter.key}
            href={filter.href}
            className={`rounded-full px-4 py-2 text-body ${
              filter.active
                ? "bg-zain-green-950 text-zain-cream-50"
                : "border border-zain-green-950/20 text-zain-green-950"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <MediaManager
        items={rows}
        canUpload={hasPermission(user.role, "media:upload")}
        canUpdate={hasPermission(user.role, "media:update")}
        canArchive={hasPermission(user.role, "media:archive")}
        canDelete={hasPermission(user.role, "media:delete")}
      />

      {total > pageSize ? (
        <nav className="flex items-center gap-4" aria-label={t("pageSummary", { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}>
          <span className="text-body text-zain-charcoal">
            {t("pageSummary", { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}
          </span>
        </nav>
      ) : null}
    </section>
  );
}
