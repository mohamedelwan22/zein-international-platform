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
import { MapSection } from "@/components/geography/map-section";
import type { MapPoint } from "@/components/geography/map-provider";

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

  const [experience, contact, locations, tHome, tContact, tEmpty, tCommon] =
    await Promise.all([
      loadHomeExperience(locale),
      loadContactInfo(locale),
      loadVerifiedLocations(locale),
      getTranslations({ locale, namespace: "home" }),
      getTranslations({ locale, namespace: "contact" }),
      getTranslations({ locale, namespace: "empty" }),
      getTranslations({ locale, namespace: "common" }),
    ]);

  // Approved coverage wording — shown whether or not locations are verified
  // (US8 scenario 4: the page always presents the approved wording).
  const coverage = experience.geographicPresence?.body ?? null;

  // Only verified locations that carry coordinates become map pins.
  const points: MapPoint[] = locations.flatMap((location) =>
    location.latitude !== null && location.longitude !== null
      ? [
          {
            id: location.id,
            latitude: location.latitude,
            longitude: location.longitude,
            label: location.city,
          },
        ]
      : [],
  );

  return (
    <>
      <Section className="bg-zain-cream-50 pb-16 pt-16 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tHome("geographicPresenceTitle")}
        </h1>

        {coverage ? (
          <p className="prose-editorial mt-6 max-w-2xl text-body-lg text-zain-green-950/80">
            {coverage}
          </p>
        ) : null}

        {contact ? (
          <div className="mt-12 max-w-xl rounded-lg border border-zain-green-950/10 bg-white p-8">
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
        ) : null}
      </Section>

      <Section className="bg-white pb-24 md:pb-32">
        {locations.length > 0 ? (
          <>
            {points.length > 0 ? (
              <MapSection
                points={points}
                provider={env.MAP_PROVIDER}
                token={env.MAP_TOKEN}
                ariaLabel={tHome("geographicPresenceTitle")}
                className="h-80 w-full overflow-hidden rounded-lg border border-zain-green-950/10 md:h-[28rem]"
              />
            ) : null}

            <ul
              className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${
                points.length > 0 ? "mt-12" : ""
              }`}
            >
              {locations.map((location) => (
                <li
                  key={location.id}
                  className="flex h-full flex-col rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-8"
                >
                  <h3 className="font-display text-h3 font-medium text-zain-green-950">
                    {location.city}
                  </h3>
                  <address className="mt-3 space-y-1 text-body not-italic text-zain-green-950/80">
                    {location.region ? <p>{location.region}</p> : null}
                    <p>{location.address}</p>
                    {location.countryCode ? <p dir="ltr">{location.countryCode}</p> : null}
                  </address>

                  {location.coverage ? (
                    <p className="mt-4 text-body text-zain-green-950/70">
                      {location.coverage}
                    </p>
                  ) : null}

                  {location.phone || location.email || location.mapUrl ? (
                    <div className="mt-4 flex flex-col gap-1">
                      {location.phone ? (
                        <a
                          href={`tel:${location.phone}`}
                          dir="ltr"
                          className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                        >
                          {location.phone}
                        </a>
                      ) : null}
                      {location.email ? (
                        <a
                          href={`mailto:${location.email}`}
                          className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                        >
                          {location.email}
                        </a>
                      ) : null}
                      {location.mapUrl ? (
                        <a
                          href={location.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
                        >
                          {tCommon("seeMore")}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState title={tEmpty("locationsTitle")} body={tEmpty("locationsBody")} />
        )}
      </Section>

      <CtaSection
        title={tHome("closingCtaTitle")}
        primary={{ href: "/contact", label: tHome("closingCtaPrimary") }}
      />
    </>
  );
}
