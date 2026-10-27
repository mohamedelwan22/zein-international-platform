import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { getInquiry } from "@/server/services/inquiries";
import { InquiryNotesForm } from "@/components/admin/inquiry-notes-form";
import { InquiryStatusControls } from "@/components/admin/inquiry-status-controls";
import { LeadDeleteButton } from "@/components/admin/lead-delete-button";
import type { LeadStatusValue } from "@/server/validation/inquiries";

/**
 * Admin lead detail (T059, admin-api.md §4). Read-only history plus the two
 * audited mutations: status transition and internal notes.
 */

export const instant = false;

const STATUS_KEY: Record<LeadStatusValue, string> = {
  new: "statusNew",
  contacted: "statusContacted",
  inProgress: "statusInProgress",
  closed: "statusClosed",
};

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function AdminInquiryDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
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

  const lead = await getInquiry(id);
  if (!lead) {
    notFound();
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const contextTags = [
    lead.productId ? "product" : null,
    lead.brandId ? "brand" : null,
    lead.supplierId ? "supplier" : null,
  ].filter((value): value is string => value !== null);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/inquiries"
          className="text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
        >
          {t("backToInquiries")}
        </Link>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("leadDetailTitle")}</h1>
        <p className="text-body text-zain-charcoal">
          {t("statusLabel")}: <strong>{t(STATUS_KEY[lead.status] as never)}</strong>
        </p>
      </div>

      <dl className="grid gap-6 sm:grid-cols-2">
        <div>
          <dt className="text-meta uppercase tracking-wide text-zain-green-700">{t("leadTypeLabel")}</dt>
          <dd className="mt-1 text-body text-zain-green-950">{lead.type}</dd>
        </div>
        <div>
          <dt className="text-meta uppercase tracking-wide text-zain-green-700">{t("leadSubmittedLabel")}</dt>
          <dd className="mt-1 text-body text-zain-green-950">{dateFmt.format(lead.createdAt)}</dd>
        </div>
        {contextTags.length > 0 ? (
          <div>
            <dt className="text-meta uppercase tracking-wide text-zain-green-700">{t("leadContextLabel")}</dt>
            <dd className="mt-1 flex flex-wrap gap-2 text-body text-zain-green-950">
              {contextTags.map((tag) => (
                <span key={tag} className="rounded-full border border-zain-green-950/15 px-3 py-1 text-meta">
                  {tag}
                </span>
              ))}
              {lead.sourcePath ? (
                <span dir="ltr" className="text-meta text-zain-charcoal">
                  {lead.sourcePath}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-meta uppercase tracking-wide text-zain-green-700">{t("leadContactLabel")}</dt>
          <dd className="mt-1 flex flex-col gap-1 text-body text-zain-green-950">
            <span>{lead.name}</span>
            {lead.company ? <span className="text-zain-charcoal">{lead.company}</span> : null}
            <a href={`mailto:${lead.email}`} dir="ltr" className="text-zain-green-700 hover:underline">
              {lead.email}
            </a>
            {lead.phone ? (
              <a href={`tel:${lead.phone}`} dir="ltr" className="text-zain-green-700 hover:underline">
                {lead.phone}
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold text-zain-green-950">{t("leadSubjectLabel")}</h2>
        <p className="text-body text-zain-green-950">{lead.subject}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold text-zain-green-950">{t("leadMessageLabel")}</h2>
        <p className="whitespace-pre-wrap text-body text-zain-charcoal">{lead.message}</p>
      </div>

      <InquiryStatusControls id={lead.id} status={lead.status} version={lead.version} />

      <InquiryNotesForm id={lead.id} notes={lead.notes} version={lead.version} />

      {hasPermission(user.role, "inquiries:delete") ? (
        <LeadDeleteButton id={lead.id} status={lead.status} />
      ) : null}
    </section>
  );
}
