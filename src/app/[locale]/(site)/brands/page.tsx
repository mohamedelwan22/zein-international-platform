import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadBrands } from "@/server/cache/catalog-content";
import { loadPageSeoOverride } from "@/server/cache/seo-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { BrandCard, EmptyState } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";

/**
 * Brands directory (T042, FR-008, FR-027): the published brand catalog as a
 * card grid — logo, name, country, category, short description, featured flag.
 * Reads are published-only (status='published' AND isActive=true); a
 * zero-record catalog renders the localized empty state, never a blank page.
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

  const [brands, tBrands, tEmpty, seo] = await Promise.all([
    loadBrands(locale),
    getTranslations({ locale, namespace: "brands" }),
    getTranslations({ locale, namespace: "empty" }),
    loadPageSeoOverride("brands", locale),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/brands",
    title: tBrands("pageTitle"),
    description: brands[0]?.summary ?? tEmpty("brandsBody"),
    seo,
  });
}

export default async function BrandsPage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [brands, tBrands, tHome, tEmpty] = await Promise.all([
    loadBrands(locale),
    getTranslations({ locale, namespace: "brands" }),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return (
    <>
      <Section className="bg-zain-cream-50 pb-20 pt-16 md:pb-28 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tBrands("pageTitle")}
        </h1>

        {brands.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <li key={brand.id}>
                <BrandCard brand={brand} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
            <EmptyState title={tEmpty("brandsTitle")} body={tEmpty("brandsBody")} />
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
