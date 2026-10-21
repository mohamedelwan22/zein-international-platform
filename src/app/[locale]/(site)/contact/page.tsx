import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadContactInfo, loadSocialLinks, loadWorkingHours } from "@/server/cache/public-content";
import { loadPageSeoOverride } from "@/server/cache/seo-content";
import { getSettings } from "@/server/services/settings";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/cards";
import { InquiryForm } from "@/components/site/inquiry-form";
import { INQUIRY_TYPES, type InquiryTypeValue } from "@/server/validation/inquiries";

/**
 * The inquiry form carries context through `searchParams` (product/brand CTAs)
 * and reads `Settings.privacy_notice` at request time, so this route blocks
 * prerendering rather than streaming a placeholder (Next 16 "blocking route").
 */
export const instant = false;

/**
 * Contact route (T036, FR-014): presents the approved contact details from
 * Settings — Jeddah, Aziziyah District, 23337 King Fahd Road; phones
 * 0126747594 / 0126747595; ahmed@zainagency.com; Zainagency.com — kept
 * editable through settings (never hardcoded). Working hours display the
 * localized pending state until client content arrives (Open Item 6).
 * The inquiry form mounts here in US4.
 */

interface RouteProps {
  params: Promise<{ locale: string }>;
}

interface PageProps extends RouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveLocale(raw: string): AppLocale {
  return isAppLocale(raw) ? raw : "en";
}

/** First value of a (possibly repeated) query parameter. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Contextual prefill for the embedded inquiry form (product/brand CTAs). */
function resolveInquiryType(raw: string | undefined): InquiryTypeValue {
  return (INQUIRY_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as InquiryTypeValue)
    : "general";
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);

  const [contact, tContact, seo] = await Promise.all([
    loadContactInfo(locale),
    getTranslations({ locale, namespace: "contact" }),
    loadPageSeoOverride("contact", locale),
  ]);

  const description = contact
    ? `${contact.country} — ${contact.city}, ${contact.district}, ${contact.address}. ${contact.email}`
    : tContact("note");

  return buildPublicMetadata({
    locale,
    path: "/contact",
    title: tContact("title"),
    description,
    seo,
  });
}

export default async function ContactPage({ params, searchParams }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const query = await searchParams;
  const [contact, privacyNotice, workingHours, socialLinks, tContact, tInquiry, tEmpty] =
    await Promise.all([
      loadContactInfo(locale),
      getSettings("privacy_notice", locale),
      loadWorkingHours(locale),
      loadSocialLinks(locale),
      getTranslations({ locale, namespace: "contact" }),
      getTranslations({ locale, namespace: "inquiry" }),
      getTranslations({ locale, namespace: "empty" }),
    ]);

  const defaultType: InquiryTypeValue = resolveInquiryType(firstParam(query.type));

  return (
    <Section className="bg-white pb-20 pt-16 md:pb-28 md:pt-24">
      <h1 className="font-display text-h1 font-medium text-zain-green-950">
        {tContact("title")}
      </h1>

      {contact ? (
        <>
          <p className="prose-editorial mt-6 max-w-2xl text-body-lg text-zain-green-950/80">
            {contact.note ?? tContact("note")}
          </p>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-8">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                {tContact("addressLabel")}
              </h2>
              <address className="mt-4 space-y-1 text-body not-italic text-zain-green-950/85">
                <p>{contact.country}</p>
                <p>
                  {contact.city}, {contact.district}
                </p>
                <p>{contact.address}</p>
              </address>
            </div>

            <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-8">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                {tContact("phoneLabel")}
              </h2>
              <ul className="mt-4 space-y-1">
                {contact.phones.map((phone) => (
                  <li key={phone}>
                    <a
                      href={`tel:${phone}`}
                      dir="ltr"
                      className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                    >
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-8">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                {tContact("emailLabel")}
              </h2>
              <a
                href={`mailto:${contact.email}`}
                className="mt-4 inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
              >
                {contact.email}
              </a>
            </div>

            <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-8">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                {tContact("websiteLabel")}
              </h2>
              <a
                href={`https://${contact.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
              >
                {contact.website}
              </a>
            </div>
          </div>

          {/* Working hours — CMS/Settings-managed (FR-014/FR-032): show the
              approved value when set, otherwise the localized pending state. */}
          <div className="mt-6 rounded-lg border border-dashed border-zain-green-950/20 bg-zain-cream-50/60 p-8">
            <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
              {tContact("workingHoursLabel")}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-body text-zain-green-950/70">
              {workingHours ?? tContact("workingHoursPending")}
            </p>
          </div>

          {socialLinks && socialLinks.length > 0 ? (
            <div className="mt-6 rounded-lg border border-zain-green-950/10 bg-zain-cream-50/60 p-8">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                {tContact("socialLabel")}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {socialLinks.map((link) => (
                  <li key={`${link.platform}-${link.url}`}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                    >
                      {link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-12">
          <EmptyState title={tEmpty("cmsTitle")} body={tEmpty("cmsBody")} />
        </div>
      )}

      {/* Business inquiry form (FR-016). Context is carried through query
          params from product/brand detail CTAs; consent copy resolves from
          Settings.privacy_notice (T060). */}
      <div className="mt-20 border-t border-zain-green-950/10 pt-16">
        <h2 className="font-display text-h2 font-medium text-zain-green-950">
          {tInquiry("formTitle")}
        </h2>
        <div className="mt-8 max-w-3xl">
          <InquiryForm
            privacyNotice={privacyNotice}
            defaultType={defaultType}
            productId={firstParam(query.productId)}
            brandId={firstParam(query.brandId)}
            supplierId={firstParam(query.supplierId)}
            sourcePath={firstParam(query.sourcePath)}
          />
        </div>
      </div>
    </Section>
  );
}
