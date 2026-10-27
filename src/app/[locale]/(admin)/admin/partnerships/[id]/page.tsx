import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { getPartnershipRequest } from "@/server/services/partnerships";
import { InquiryNotesForm } from "@/components/admin/inquiry-notes-form";
import { InquiryStatusControls } from "@/components/admin/inquiry-status-controls";
import { LeadDeleteButton } from "@/components/admin/lead-delete-button";
import type { LeadStatusValue } from "@/server/validation/inquiries";

/**
 * Admin partnership detail (T066, admin-api.md §4). Read-only history plus the
 * two audited mutations (status transition, internal notes) and the audited
 * attachment download (FR-035).
 */

export const instant = false;

const STATUS_KEY: Record<LeadStatusValue, string> = {
  new: "statusNew",
  contacted: "statusContacted",
  inProgress: "statusInProgress",
  closed: "statusClosed",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("partnershipDetailTitle"), robots: { index: false, follow: false } };
}

export default async function AdminPartnershipDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [t, tp, tErrors] = await Promise.all([
    getTranslations("admin"),
    getTranslations("partnership"),
    getTranslations("errors"),
  ]);
  const user = await getSessionUser();

  if (!user || !hasPermission(user.role, "partnerships:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const lead = await getPartnershipRequest(id);
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
          href="/admin/partnerships"
          className="text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
        >
          {t("backToPartnerships")}
        </Link>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("partnershipDetailTitle")}</h1>
        <p className="text-body text-zain-charcoal">
          {t("statusLabel")}: <strong>{t(STATUS_KEY[lead.status] as never)}</strong>
        </p>
      </div>

      <dl className="grid gap-6 sm:grid-cols-2">
        <div>
          <dt className="text-meta uppercase tracking-wide text-zain-green-700">
            {tp("companyLabel")}
          </dt>
          <dd className="mt-1 text-body text-zain-green-950">{lead.company}</dd>
        </div>
        <div>
          <dt className="text-meta uppercase tracking-wide text-zain-green-700">
            {t("leadSubmittedLabel")}
          </dt>
          <dd className="mt-1 text-body text-zain-green-950">{dateFmt.format(lead.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-meta uppercase tracking-wide text-zain-green-700">
            {t("leadContactLabel")}
          </dt>
          <dd className="mt-1 flex flex-col gap-1 text-body text-zain-green-950">
            <span>{lead.name}</span>
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
        {lead.country ? (
          <div>
            <dt className="text-meta uppercase tracking-wide text-zain-green-700">
              {tp("countryLabel")}
            </dt>
            <dd className="mt-1 text-body text-zain-green-950">{lead.country}</dd>
          </div>
        ) : null}
        {lead.businessType ? (
          <div>
            <dt className="text-meta uppercase tracking-wide text-zain-green-700">
              {tp("businessTypeLabel")}
            </dt>
            <dd className="mt-1 text-body text-zain-green-950">{lead.businessType}</dd>
          </div>
        ) : null}
        {lead.website ? (
          <div>
            <dt className="text-meta uppercase tracking-wide text-zain-green-700">
              {tp("websiteLabel")}
            </dt>
            <dd className="mt-1 text-body text-zain-green-950">
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="text-zain-green-700 hover:underline"
              >
                {lead.website}
              </a>
            </dd>
          </div>
        ) : null}
        {lead.productCategory ? (
          <div>
            <dt className="text-meta uppercase tracking-wide text-zain-green-700">
              {tp("productCategoryLabel")}
            </dt>
            <dd className="mt-1 text-body text-zain-green-950">{lead.productCategory}</dd>
          </div>
        ) : null}
      </dl>

      {contextTags.length > 0 ? (
        <div>
          <h2 className="text-meta uppercase tracking-wide text-zain-green-700">
            {t("leadContextLabel")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {contextTags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-zain-green-950/15 px-3 py-1 text-meta text-zain-charcoal"
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h2 className="text-meta uppercase tracking-wide text-zain-green-700">
          {tp("messageLabel")}
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-body text-zain-green-950">{lead.message}</p>
      </div>

      <div>
        <h2 className="text-meta uppercase tracking-wide text-zain-green-700">
          {t("attachmentLabel")}
        </h2>
        {lead.attachment ? (
          <a
            href={`/api/admin/partnerships/${lead.id}/attachment`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
          >
            {t("downloadAttachment")}
          </a>
        ) : (
          <p className="mt-2 text-body text-zain-charcoal">{t("noAttachment")}</p>
        )}
        {lead.attachment ? (
          <p className="mt-1 text-meta text-zain-charcoal" dir="ltr">
            {lead.attachment.originalName} · {formatBytes(lead.attachment.byteSize)}
          </p>
        ) : null}
      </div>

      <InquiryStatusControls
        id={lead.id}
        status={lead.status}
        version={lead.version}
        endpoint="/api/admin/partnerships"
      />

      <InquiryNotesForm
        id={lead.id}
        notes={lead.notes}
        version={lead.version}
        endpoint="/api/admin/partnerships"
      />

      {hasPermission(user.role, "partnerships:delete") ? (
        <LeadDeleteButton
          id={lead.id}
          status={lead.status}
          endpoint="/api/admin/partnerships"
          redirectTo="/admin/partnerships"
        />
      ) : null}
    </section>
  );
}
