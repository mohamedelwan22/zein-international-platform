import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { listInquiries } from "@/server/services/inquiries";
import { LeadDeleteButton } from "@/components/admin/lead-delete-button";
import {
  LEAD_STATUSES,
  leadListQuerySchema,
  type LeadStatusValue,
} from "@/server/validation/inquiries";

/**
 * Admin inquiries queue (T059, admin-api.md §4, FR-017).
 *
 * Permission `inquiries:read` (Sales/Business + Super Admin) enforced here
 * because the static route shadows the shared `[...section]` guard. Lists
 * leads newest-first with a status filter and pagination; each row opens the
 * detail view where authorized staff progress the pipeline.
 */

export const instant = false;

const STATUS_KEY: Record<LeadStatusValue, string> = {
  new: "statusNew",
  contacted: "statusContacted",
  inProgress: "statusInProgress",
  closed: "statusClosed",
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("inquiries"), robots: { index: false, follow: false } };
}

export default async function AdminInquiriesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser().catch(() => null);

  if (!user || !hasPermission(user.role, "inquiries:read")) {
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
  const parsed = leadListQuerySchema.safeParse({
    status: firstParam(query.status),
    page: firstParam(query.page),
    pageSize: firstParam(query.pageSize),
  });
  const { status, page, pageSize } = parsed.success
    ? parsed.data
    : { status: undefined, page: 1, pageSize: 20 };

  const canDelete = hasPermission(user.role, "inquiries:delete");
  const { items, total } = await listInquiries({ status, page, pageSize });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const filterHref = (value?: LeadStatusValue) =>
    value ? `/admin/inquiries?status=${value}` : "/admin/inquiries";
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(target));
    return `/admin/inquiries?${params.toString()}`;
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-h2 font-bold text-zain-green-950">{t("inquiries")}</h1>

      <div className="flex flex-wrap items-center gap-2" aria-label={t("statusFilterLabel")}>
        <Link
          href={filterHref()}
          className={`rounded-full px-4 py-2 text-body ${!status ? "bg-zain-green-950 text-zain-cream-50" : "border border-zain-green-950/20 text-zain-green-950"}`}
        >
          {t("statusAll")}
        </Link>
        {LEAD_STATUSES.map((value) => (
          <Link
            key={value}
            href={filterHref(value)}
            className={`rounded-full px-4 py-2 text-body ${status === value ? "bg-zain-green-950 text-zain-cream-50" : "border border-zain-green-950/20 text-zain-green-950"}`}
          >
            {t(STATUS_KEY[value] as never)}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white p-10">
          <h2 className="text-h3 font-semibold text-zain-green-950">{t("noInquiries")}</h2>
          <p className="mt-2 text-body text-zain-charcoal">{t("noInquiriesBody")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zain-green-950/10 bg-white">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-zain-green-950/10 text-start text-meta uppercase tracking-wide text-zain-green-700">
                <th className="px-4 py-3 text-start">{t("leadSubjectLabel")}</th>
                <th className="px-4 py-3 text-start">{t("leadTypeLabel")}</th>
                <th className="px-4 py-3 text-start">{t("leadContactLabel")}</th>
                <th className="px-4 py-3 text-start">{t("leadSubmittedLabel")}</th>
                <th className="px-4 py-3 text-start">{t("statusLabel")}</th>
                <th className="px-4 py-3 text-start">{t("openInquiry")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id} className="border-b border-zain-green-950/5">
                  <td className="px-4 py-3 text-body font-semibold text-zain-green-950">
                    {lead.subject}
                  </td>
                  <td className="px-4 py-3 text-body text-zain-charcoal">{lead.type}</td>
                  <td className="px-4 py-3 text-body text-zain-charcoal" dir="ltr">
                    {lead.email}
                  </td>
                  <td className="px-4 py-3 text-body text-zain-charcoal">
                    {dateFmt.format(lead.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-body text-zain-charcoal">
                    {t(STATUS_KEY[lead.status] as never)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/inquiries/${lead.id}`}
                        className="text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
                      >
                        {t("openInquiry")}
                      </Link>
                      {canDelete ? (
                        <LeadDeleteButton
                          id={lead.id}
                          status={lead.status}
                          variant="row"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center gap-4" aria-label={t("pageSummary", { page, pages })}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-body font-semibold text-zain-green-700">
              {t("previousPage")}
            </Link>
          ) : null}
          <span className="text-body text-zain-charcoal">
            {t("pageSummary", { page, pages })}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="text-body font-semibold text-zain-green-700">
              {t("nextPage")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
