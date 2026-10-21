import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadAboutExperience } from "@/server/cache/public-content";
import { loadPageSeoOverride } from "@/server/cache/seo-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Section, SectionHeading } from "@/components/site/section-heading";
import { EmptyState, ValueCard } from "@/components/site/cards";

/**
 * About route (T035, FR-005, SC-001.3): Our Story, Our History, Profile,
 * Journey Towards Excellence, Mission, Vision, the seven approved Values,
 * Sustainability, and Innovation — all rendered from the CMS about section
 * (FR-038), including the approved 1394 AH founding reference carried in
 * the copy. No unapproved milestones or statistics are added.
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

  const [experience, tNav, tEmpty, seo] = await Promise.all([
    loadAboutExperience(locale),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "empty" }),
    loadPageSeoOverride("about", locale),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/about",
    title: tNav("about"),
    description: experience.story[0] ?? tEmpty("cmsBody"),
    seo,
  });
}

export default async function AboutPage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [experience, tNav, tAbout, tFooter, tEmpty] = await Promise.all([
    loadAboutExperience(locale),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "about" }),
    getTranslations({ locale, namespace: "footer" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  if (!experience.section) {
    return (
      <Section className="bg-zain-cream-50 py-24">
        <EmptyState title={tEmpty("cmsTitle")} body={tEmpty("cmsBody")} />
      </Section>
    );
  }

  const longFormSections = [
    { titleKey: "historyTitle", paragraphs: experience.history },
    { titleKey: "profileTitle", paragraphs: experience.profile },
    { titleKey: "journeyTitle", paragraphs: experience.journey },
  ] as const;

  return (
    <>
      {/* Editorial intro — the approved story with the 1394 AH reference. */}
      <Section className="bg-zain-cream-50 pb-20 pt-16 md:pb-28 md:pt-24">
        <p className="text-meta font-semibold uppercase tracking-widest text-zain-green-700">
          {tFooter("companyName")}
        </p>
        <h1 className="mt-3 font-display text-h1 font-medium text-zain-green-950">
          {tNav("about")}
        </h1>
        <div className="mt-10 grid gap-12 lg:grid-cols-[2fr_1fr] lg:items-start">
          <div>
            <h2 className="font-display text-h2 font-medium text-zain-green-950">
              {tAbout("storyTitle")}
            </h2>
            <div className="prose-editorial mt-6 space-y-6 text-body-lg text-zain-green-950/80">
              {experience.story.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-zain-green-950/10 bg-white p-8">
            <h2 className="font-display text-h3 font-medium text-zain-green-950">
              {tAbout("missionTitle")}
            </h2>
            <p className="mt-4 text-body text-zain-green-950/75">
              {experience.mission?.body}
            </p>
          </div>
        </div>
      </Section>

      {/* Long-form sections alternate cream/white for editorial rhythm. */}
      {longFormSections.map((section, index) => (
        <Section
          key={section.titleKey}
          className={
            index % 2 === 0
              ? "bg-white py-20 md:py-28"
              : "bg-zain-cream-50 py-20 md:py-28"
          }
        >
          <SectionHeading namespace="about" titleKey={section.titleKey} />
          <div className="prose-editorial mt-6 space-y-6 text-body text-zain-green-950/80">
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex}>{paragraph}</p>
            ))}
          </div>
        </Section>
      ))}

      {/* Mission & Vision. */}
      <Section className="bg-white py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <SectionHeading namespace="about" titleKey="missionTitle" />
            <p className="prose-editorial mt-6 text-body text-zain-green-950/80">
              {experience.mission?.body}
            </p>
          </div>
          <div>
            <SectionHeading namespace="about" titleKey="visionTitle" />
            <p className="prose-editorial mt-6 text-body text-zain-green-950/80">
              {experience.vision?.body}
            </p>
          </div>
        </div>
      </Section>

      {/* The seven approved values. */}
      <Section className="bg-zain-cream-50 py-20 md:py-28">
        <SectionHeading namespace="about" titleKey="valuesTitle" />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {experience.values.map((value) => (
            <li key={value.id}>
              <ValueCard value={value} />
            </li>
          ))}
        </ul>
      </Section>

      {/* Sustainability. */}
      {experience.sustainability ? (
        <Section className="bg-white py-20 md:py-28">
          <SectionHeading namespace="about" titleKey="sustainabilityTitle" />
          <div className="prose-editorial mt-6 space-y-6 text-body text-zain-green-950/80">
            {experience.sustainability.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Innovation. */}
      {experience.innovation ? (
        <Section className="bg-zain-cream-100 py-20 md:py-28">
          <SectionHeading namespace="about" titleKey="innovationTitle" />
          <p className="prose-editorial mt-6 text-body-lg text-zain-green-950/80">
            {experience.innovation.body}
          </p>
        </Section>
      ) : null}
    </>
  );
}
