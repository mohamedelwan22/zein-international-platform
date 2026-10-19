import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadContactInfo, loadHomeExperience } from "@/server/cache/public-content";
import { loadVerifiedLocations } from "@/server/cache/geographic-content";
import { buildPublicMetadata } from "@/lib/seo";
import { env } from "@/lib/env";
import { Section } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";
import { LocationExplorer } from "@/components/geography/location-explorer";

/**
 * Geographic-presence experience (T087, FR-013, US8).
 *
 * Presents the approved coverage wording (from the home CMS section — never
 * invented), the confirmed company address from Settings (Jeddah), and the
 * verified locations list. A location becomes a map pin only when it is
 * verified AND carries coordinates; locations without coordinates render as
 * text addresses. With zero verified locations the page still shows the
 * approved wording and a localized empty state — never a fabricated point.
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

  const [experience, tHome, tEmpty] = await Promise.all([
    loadHomeExperience(locale),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/geographic-presence",
    title: tHome("geographicPresenceTitle"),
    description: experience.geographicPresence?.body ?? tEmpty("locationsBody"),
  });
}

export default async function GeographicPresencePage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [experience, contact, locations, tHome, tGeography, tEmpty] =
    await Promise.all([
      loadHomeExperience(locale),
      loadContactInfo(locale),
      loadVerifiedLocations(locale),
      getTranslations({ locale, namespace: "home" }),
      getTranslations({ locale, namespace: "geography" }),
      getTranslations({ locale, namespace: "empty" }),
    ]);

  // Approved coverage wording — shown whether or not locations are verified
  // (US8 scenario 4: the page always presents the approved wording).
  const coverage = experience.geographicPresence?.body ?? null;

  return (
    <>
      <Section className="bg-zain-cream-50 pb-16 pt-16 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tHome("geographicPresenceTitle")}
        </h1>

        {coverage ? (
          <p
            data-testid="geographic-coverage"
            className="prose-editorial mt-6 max-w-2xl text-body-lg text-zain-green-950/80"
          >
            {coverage}
          </p>
        ) : null}

        {contact ? (
          <div className="mt-12 max-w-xl rounded-lg border border-zain-green-950/10 bg-white p-8">
            <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
              {tGeography("corporateAddressTitle")}
            </h2>
            <address className="mt-4 space-y-1 text-body not-italic text-zain-green-950/85">
              <p>{contact.country}</p>
              <p>
                {contact.city}, {contact.district}
              </p>
              <p>{contact.address}</p>
            </address>
          </div>
        ) : null}
      </Section>

      <Section className="bg-white pb-24 md:pb-32">
        {locations.length > 0 ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-h2 font-medium text-zain-green-950">
                {tGeography("coverageTitle")}
              </h2>
              <p className="text-meta text-zain-green-950/70">
                {tGeography("locationCountLabel")}:{" "}
                <span data-testid="location-count">{locations.length}</span>
              </p>
            </div>

            <div className="mt-10">
              <LocationExplorer
                locations={locations}
                provider={env.MAP_PROVIDER}
                token={env.MAP_TOKEN}
                mapAriaLabel={tHome("geographicPresenceTitle")}
              />
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-h2 font-medium text-zain-green-950">
              {tGeography("coverageTitle")}
            </h2>
            <div className="mt-10">
              <EmptyState title={tEmpty("locationsTitle")} body={tEmpty("locationsBody")} />
            </div>
          </>
        )}
      </Section>

      <CtaSection
        title={tHome("closingCtaTitle")}
        primary={{ href: "/contact", label: tHome("closingCtaPrimary") }}
      />
    </>
  );
}
