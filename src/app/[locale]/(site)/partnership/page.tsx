import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { getSettings } from "@/server/services/settings";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { PartnershipForm } from "@/components/site/partnership-form";

/**
 * Partnership route (T065, FR-005/FR-018).
 *
 * A dedicated B2B channel reusing the inquiry form's validation, localization,
 * and consent model. The consent copy resolves from `Settings.privacy_notice`
 * so the live notice is linked without code change; while that content is
 * pending (Open Item 6) a localized "content pending" note shows instead of a
 * placeholder. Reading the privacy notice at request time blocks prerendering.
 */
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "partnership" });
  return buildPublicMetadata({
    locale,
    path: "/partnership",
    title: t("formTitle"),
    description: t("successBody"),
  });
}

export default async function PartnershipPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [privacyNotice, t] = await Promise.all([
    getSettings("privacy_notice", locale),
    getTranslations({ locale, namespace: "partnership" }),
  ]);

  return (
    <Section className="bg-white pb-20 pt-16 md:pb-28 md:pt-24">
      <h1 className="font-display text-h1 font-medium text-zain-green-950">
        {t("formTitle")}
      </h1>
      <div className="mt-10 max-w-3xl">
        <PartnershipForm privacyNotice={privacyNotice} />
      </div>
    </Section>
  );
}
