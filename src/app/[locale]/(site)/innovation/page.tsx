import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadAboutExperience } from "@/server/cache/public-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";

/** Innovation route (T035, FR-005): approved innovation copy from the CMS. */

interface RouteProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(raw: string): AppLocale {
  return isAppLocale(raw) ? raw : "en";
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);

  const [experience, tAbout, tEmpty] = await Promise.all([
    loadAboutExperience(locale),
    getTranslations({ locale, namespace: "about" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/innovation",
    title: tAbout("innovationTitle"),
    description: experience.innovation?.body ?? tEmpty("cmsBody"),
  });
}

export default async function InnovationPage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [experience, tAbout, tHome, tEmpty] = await Promise.all([
    loadAboutExperience(locale),
    getTranslations({ locale, namespace: "about" }),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return (
    <>
      <Section className="bg-white pb-20 pt-16 md:pb-28 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tAbout("innovationTitle")}
        </h1>
        {experience.innovation ? (
          <p className="prose-editorial mt-10 max-w-3xl text-body-lg text-zain-green-950/80">
            {experience.innovation.body}
          </p>
        ) : (
          <div className="mt-10">
            <EmptyState title={tEmpty("cmsTitle")} body={tEmpty("cmsBody")} />
          </div>
        )}
      </Section>
      <CtaSection
        title={tHome("closingCtaTitle")}
        primary={{ href: "/contact", label: tHome("closingCtaPrimary") }}
      />
    </>
  );
}
