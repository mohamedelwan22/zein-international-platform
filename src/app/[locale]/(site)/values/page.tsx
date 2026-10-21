import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadAboutExperience } from "@/server/cache/public-content";
import { loadPageSeoOverride } from "@/server/cache/seo-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { EmptyState, ValueCard } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";

/** Values route (T035, FR-005): the seven approved values from the CMS. */

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

  const [experience, tAbout, tEmpty, seo] = await Promise.all([
    loadAboutExperience(locale),
    getTranslations({ locale, namespace: "about" }),
    getTranslations({ locale, namespace: "empty" }),
    loadPageSeoOverride("values", locale),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/values",
    title: tAbout("valuesTitle"),
    description: experience.values[0]?.description ?? tEmpty("cmsBody"),
    seo,
  });
}

export default async function ValuesPage({ params }: RouteProps) {
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
      <Section className="bg-zain-cream-50 pb-20 pt-16 md:pb-28 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tAbout("valuesTitle")}
        </h1>
        {experience.values.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {experience.values.map((value) => (
              <li key={value.id}>
                <ValueCard value={value} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
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
