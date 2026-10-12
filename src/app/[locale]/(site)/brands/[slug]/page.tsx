import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import { loadBrandDetail } from "@/server/cache/catalog-content";
import { listPublishedBrands } from "@/server/services/catalog";
import { buildPublicMetadata } from "@/lib/seo";
import { Section, SectionHeading } from "@/components/site/section-heading";
import { ProductCard, EmptyState } from "@/components/site/cards";
import { MediaImage } from "@/components/site/media-image";
import { CtaButton } from "@/components/site/cta-button";
import { Link } from "@/i18n/navigation";

/**
 * Brand detail (T042, FR-008): logo, cover, name, country, category, about,
 * history, distribution information, the brand's published products, and an
 * inquiry call to action — all bilingual and admin-managed. A brand that is
 * not published (or an unknown/redirected slug) yields the localized 404; the
 * SlugRedirect is resolved inside the catalog service (data-model §2.11).
 *
 * Cache Components (T042): `slug` is runtime data resolved per-locale against
 * the published catalog, so the detail page is generated from the catalog's
 * published slugs (`generateStaticParams`) and new slugs render on first
 * request — the ISR-equivalent public caching strategy. Because the read sits
 * behind `generateStaticParams`, the page body can await `params` directly and
 * still return a real 404 for unknown slugs (a `<Suspense>` stream would flush
 * a 200 shell first). `instant = false` opts this segment out of
 * instant-navigation validation: a navigation into a dynamic `[slug]`
 * re-renders only below the shared layout, so a top-level `await params` is
 * allowed to block (it must, to decide the 404) — the framework otherwise
 * aborts the navigation (T043 defect fix). The published read stays cached
 * (`use cache` + tags).
 */

export const instant = false;

interface RouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

function resolveLocale(raw: string): AppLocale {
  return isAppLocale(raw) ? raw : "en";
}

/**
 * Prerender a page per published brand slug, per locale (slugs are localized).
 * Slugs published after a build are runtime params: they render on first
 * request and are then saved, which is the ISR-equivalent behaviour described
 * in the caching strategy. Cache Components requires at least one param, so an
 * empty catalog falls back to a sentinel that the page resolves to the 404.
 */
export async function generateStaticParams() {
  const perLocale = await Promise.all(
    routing.locales.map(async (locale) => {
      const brands = await listPublishedBrands(locale);
      return brands.map((brand) => ({ locale, slug: brand.slug }));
    }),
  );
  const params = perLocale.flat();

  return params.length > 0
    ? params
    : routing.locales.map((locale) => ({ locale, slug: "__sentinel__" }));
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);

  const [brand, tBrands, tEmpty] = await Promise.all([
    loadBrandDetail(locale, slug),
    getTranslations({ locale, namespace: "brands" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: `/brands/${slug}`,
    title: brand?.name ?? tBrands("pageTitle"),
    description: brand?.summary ?? brand?.history ?? tEmpty("brandsBody"),
  });
}

export default async function BrandDetailPage({ params }: RouteProps) {
  const { locale: raw, slug } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [brand, tBrands, tInquiry, tCommon, tEmpty] = await Promise.all([
    loadBrandDetail(locale, slug),
    getTranslations({ locale, namespace: "brands" }),
    getTranslations({ locale, namespace: "inquiry" }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  if (!brand) {
    notFound();
  }

  const pending = tCommon("contentPending");
  const categoryNames = brand.categories.map((category) => category.name).join(", ");

  return (
    <>
      {/* Brand hero — cover, logo, name, and the country/category facts. */}
      <Section className="bg-zain-cream-50 pb-16 pt-16 md:pb-20 md:pt-24">
        <Link
          href="/brands"
          className="inline-flex min-h-11 items-center text-meta font-semibold text-zain-green-700 underline-offset-4 hover:underline"
        >
          {tBrands("backToDirectory")}
        </Link>

        <MediaImage
          mediaId={brand.coverMediaId}
          className="mt-6 aspect-[16/6] w-full rounded-lg"
        />

        <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-start">
          <MediaImage
            mediaId={brand.logoMediaId}
            className="aspect-square w-28 shrink-0 rounded-lg md:w-36"
          />
          <div className="flex-1">
            <h1 className="font-display text-h1 font-medium text-zain-green-950">
              {brand.name}
            </h1>

            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tBrands("countryLabel")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  {brand.originCountry ?? pending}
                </dd>
              </div>
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tBrands("categoryLabel")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  {categoryNames.length > 0 ? categoryNames : pending}
                </dd>
              </div>
            </dl>

            {brand.website ? (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex min-h-11 items-center text-body text-zain-green-700 underline-offset-4 hover:underline"
              >
                {brand.website}
              </a>
            ) : null}
          </div>
        </div>
      </Section>

      {/* About — the approved brand summary. */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="brands" titleKey="aboutLabel" />
        <p className="prose-editorial mt-6 max-w-3xl text-body-lg text-zain-green-950/80">
          {brand.summary ?? pending}
        </p>
      </Section>

      {/* History. */}
      <Section className="bg-zain-cream-50 py-20 md:py-28">
        <SectionHeading namespace="brands" titleKey="historyTitle" />
        <p className="prose-editorial mt-6 max-w-3xl text-body text-zain-green-950/80">
          {brand.history ?? pending}
        </p>
      </Section>

      {/* Distribution information. */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="brands" titleKey="distributionTitle" />
        <p className="prose-editorial mt-6 max-w-3xl text-body text-zain-green-950/80">
          {brand.distribution ?? pending}
        </p>
      </Section>

      {/* The brand's published products (related products). */}
      <Section className="bg-zain-cream-50 py-20 md:py-28">
        <SectionHeading namespace="brands" titleKey="productsTitleLabel" />
        {brand.products.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {brand.products.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
            <EmptyState title={tEmpty("productsTitle")} body={tEmpty("productsBody")} />
          </div>
        )}
      </Section>

      {/* Inquiry call to action (FR-008). */}
      <Section className="bg-white py-16 md:py-20">
        <div className="flex flex-col items-start gap-6 rounded-xl bg-zain-green-950 px-8 py-12 md:flex-row md:items-center md:justify-between md:px-16">
          <p className="max-w-xl font-display text-h3 font-medium text-zain-cream-50">
            {brand.name}
          </p>
          <CtaButton
            href={`/contact?type=brand&brandId=${brand.id}&sourcePath=${encodeURIComponent(
              `/brands/${brand.slug}`,
            )}`}
            surface="dark"
          >
            {tInquiry("cta")}
          </CtaButton>
        </div>
      </Section>
    </>
  );
}
