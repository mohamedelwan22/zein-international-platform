import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadHomeExperience } from "@/server/cache/public-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Hero, type HeroCta } from "@/components/site/hero";
import { Section, SectionHeading } from "@/components/site/section-heading";
import { CategoryCard, EmptyState } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";
import { CtaButton } from "@/components/site/cta-button";

/**
 * Home route (T034, FR-006): CMS hero, company preview, approved dynamic
 * categories preview, geographic-presence teaser, concise approved
 * Mission/Vision, gated statistics (FR-007), and closing calls to action.
 */

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

  const [experience, tFooter, tEmpty] = await Promise.all([
    loadHomeExperience(locale),
    getTranslations({ locale, namespace: "footer" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/",
    title: experience.hero?.headline ?? tFooter("companyName"),
    description:
      experience.hero?.supporting ?? experience.aboutPreview?.body ?? tEmpty("cmsBody"),
  });
}

export default async function HomePage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [experience, tFooter, tEmpty, tCommon] = await Promise.all([
    loadHomeExperience(locale),
    getTranslations({ locale, namespace: "footer" }),
    getTranslations({ locale, namespace: "empty" }),
    getTranslations({ locale, namespace: "common" }),
  ]);

  if (!experience.hero) {
    return (
      <Section className="bg-zain-cream-50 py-24">
        <EmptyState title={tEmpty("cmsTitle")} body={tEmpty("cmsBody")} />
      </Section>
    );
  }

  const tHome = await getTranslations({ locale, namespace: "home" });

  const heroCtas: { primary: HeroCta; secondary: HeroCta } = {
    primary:
      experience.ctas?.primary ??
      ({ label: tHome("heroCtaPrimary"), href: "/contact" } as HeroCta),
    secondary:
      experience.ctas?.secondary ??
      ({ label: tHome("heroCtaSecondary"), href: "/brands" } as HeroCta),
  };

  return (
    <>
      <Hero
        hero={experience.hero}
        eyebrow={tFooter("companyName")}
        primaryCta={heroCtas.primary}
        secondaryCta={heroCtas.secondary}
      />

      {/* Company preview — cream editorial band (§16 rhythm). */}
      {experience.aboutPreview ? (
        <Section className="bg-zain-cream-50 py-20 md:py-28">
          <div className="grid gap-10 md:grid-cols-[2fr_1fr] md:items-end">
            <div>
              <SectionHeading
                namespace="home"
                titleKey="aboutPreviewTitle"
                eyebrow={tFooter("companyName")}
              />
              <p className="prose-editorial mt-6 text-body-lg text-zain-green-950/80">
                {experience.aboutPreview.body}
              </p>
            </div>
            <div className="md:justify-self-end">
              <CtaButton href="/about" variant="secondary" surface="light">
                {tHome("aboutPreviewTitle")}
              </CtaButton>
            </div>
          </div>
        </Section>
      ) : null}

      {/* Approved product categories — fully dynamic (FR-027). */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="home" titleKey="categoriesTitle" />
        {experience.categories.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {experience.categories.map((category) => (
              <li key={category.id}>
                <CategoryCard category={category} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
            <EmptyState title={tEmpty("categoriesTitle")} body={tEmpty("categoriesBody")} />
          </div>
        )}
      </Section>

      {/* Statistics — rendered ONLY with approved values (FR-007). */}
      {experience.statistics.length > 0 ? (
        <Section className="bg-zain-green-950 py-16 md:py-24">
          <SectionHeading namespace="home" titleKey="statisticsTitle" onDark />
          <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {experience.statistics.map((statistic) => (
              <li key={statistic.label} className="text-center">
                <p className="font-display text-h1 font-medium text-zain-gold-400" dir="auto">
                  {statistic.value}
                </p>
                <p className="mt-2 text-body text-zain-cream-50/85">{statistic.label}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Geographic presence teaser — approved wording only (FR-013). */}
      {experience.geographicPresence ? (
        <Section className="bg-zain-cream-100 py-20 md:py-28">
          <SectionHeading
            namespace="home"
            titleKey="geographicPresenceTitle"
            link={{ href: "/geographic-presence", label: tCommon("seeMore") }}
          />
          <p className="prose-editorial mt-6 text-body-lg text-zain-green-950/80">
            {experience.geographicPresence.body}
          </p>
        </Section>
      ) : null}

      {/* Concise approved Mission & Vision (FR-006). */}
      {experience.mission || experience.vision ? (
        <Section className="bg-white py-20 md:py-28">
          <div className="grid gap-12 md:grid-cols-2">
            {experience.mission ? (
              <div>
                <SectionHeading namespace="home" titleKey="missionTitle" />
                <p className="prose-editorial mt-6 text-body text-zain-green-950/80">
                  {experience.mission.body}
                </p>
              </div>
            ) : null}
            {experience.vision ? (
              <div>
                <SectionHeading namespace="home" titleKey="visionTitle" />
                <p className="prose-editorial mt-6 text-body text-zain-green-950/80">
                  {experience.vision.body}
                </p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* Closing calls to action — Contact / inquiry / partnership. */}
      <CtaSection
        title={experience.finalCta?.title ?? tHome("closingCtaTitle")}
        primary={
          experience.finalCta?.primary ??
          { href: "/contact", label: tHome("closingCtaPrimary") }
        }
        secondary={
          experience.finalCta?.secondary ?? {
            href: "/partnership",
            label: tHome("closingCtaSecondary"),
          }
        }
      />
    </>
  );
}
