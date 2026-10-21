import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import {
  loadProductDetail,
  loadProducts,
} from "@/server/cache/catalog-content";
import { loadEntitySeoOverride } from "@/server/cache/seo-content";
import {
  listPublishedProducts,
  resolveLocalizedSlug,
} from "@/server/services/catalog";
import type { PublishedProductSummary } from "@/server/services/catalog";
import { buildPublicMetadata } from "@/lib/seo";
import { decodeSlugParam } from "@/lib/slug";
import { Section, SectionHeading } from "@/components/site/section-heading";
import { ProductCard } from "@/components/site/cards";
import { MediaImage } from "@/components/site/media-image";
import { CtaButton } from "@/components/site/cta-button";
import { Link } from "@/i18n/navigation";

/**
 * Product detail (T043, FR-009): images, bilingual name, brand, category,
 * country of origin, short and full descriptions, specifications, optional
 * SKU/reference/brochure, related products, the related brand, and an inquiry
 * call to action — all bilingual and admin-managed, with no price, stock,
 * cart, ordering, rating, or review surface anywhere (FR-010). A product that
 * is not published (or an unknown/redirected slug) yields the localized 404;
 * the SlugRedirect is resolved inside the catalog service (data-model §2.4).
 *
 * Cache Components (T043): `slug` is runtime data resolved per-locale against
 * the published catalog, so the detail page is generated from the catalog's
 * published slugs (`generateStaticParams`) and new slugs render on first
 * request — the ISR-equivalent public caching strategy. Because the read sits
 * behind `generateStaticParams`, the page body can await `params` directly and
 * still return a real 404 for unknown slugs. `instant = false` opts this
 * segment out of instant-navigation validation: a navigation into a dynamic
 * `[slug]` re-renders only below the shared layout, so a top-level `await
 * params` is allowed to block (it must, to decide the 404) — the framework
 * otherwise aborts the navigation. The published read stays cached (`use
 * cache` + tags).
 */

export const instant = false;

interface RouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

function resolveLocale(raw: string): AppLocale {
  return isAppLocale(raw) ? raw : "en";
}

/**
 * Prerender a page per published product slug, per locale (slugs are
 * localized). Slugs published after a build are runtime params: they render on
 * first request and are then saved — the ISR-equivalent behaviour. Cache
 * Components requires at least one param, so an empty catalog falls back to a
 * sentinel that the page resolves to the 404.
 */
export async function generateStaticParams() {
  const perLocale = await Promise.all(
    routing.locales.map(async (locale) => {
      const products = await listPublishedProducts(locale);
      return products.map((product) => ({ locale, slug: product.slug }));
    }),
  );
  const params = perLocale.flat();

  return params.length > 0
    ? params
    : routing.locales.map((locale) => ({ locale, slug: "__sentinel__" }));
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale: raw, slug: rawSlug } = await params;
  const locale = resolveLocale(raw);
  const slug = decodeSlugParam(rawSlug);
  setRequestLocale(locale);

  const [product, tCatalog, tEmpty] = await Promise.all([
    loadProductDetail(locale, slug),
    getTranslations({ locale, namespace: "catalog" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  // Slugs are localized, so each locale's detail URL differs (BUG-002). Emit
  // correct hreflang alternates rather than the same slug in both locales.
  const canonicalSlug = product?.canonicalSlug ?? slug;
  const pair = product
    ? await resolveLocalizedSlug("product", locale, canonicalSlug)
    : null;
  const seo = product ? await loadEntitySeoOverride("product", product.id, locale) : null;
  const languagePaths = pair
    ? {
        en: `/products/${locale === "en" ? pair.slug : pair.alternateSlug}`,
        ar: `/products/${locale === "ar" ? pair.slug : pair.alternateSlug}`,
      }
    : undefined;

  return buildPublicMetadata({
    locale,
    path: `/products/${canonicalSlug}`,
    title: product?.name ?? tCatalog("pageTitle"),
    description: product?.summary ?? tEmpty("productsBody"),
    seo,
    languagePaths,
  });
}

/** Specifications render as plain key/value facts — never invented structure. */
function specEntries(specifications: Record<string, unknown> | null): [string, unknown][] {
  if (
    !specifications ||
    typeof specifications !== "object" ||
    Array.isArray(specifications)
  ) {
    return [];
  }
  return Object.entries(specifications);
}

function renderSpecValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export default async function ProductDetailPage({ params }: RouteProps) {
  const { locale: raw, slug: rawSlug } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const slug = decodeSlugParam(rawSlug);
  setRequestLocale(locale);

  const [product, tCatalog, tInquiry, tCommon] = await Promise.all([
    loadProductDetail(locale, slug),
    getTranslations({ locale, namespace: "catalog" }),
    getTranslations({ locale, namespace: "inquiry" }),
    getTranslations({ locale, namespace: "common" }),
  ]);

  if (!product) {
    // The slug may be the OTHER locale's slug — e.g. a locale switch or a
    // shared link that swapped only the prefix (BUG-002). Resolve it to this
    // locale's canonical slug and redirect there instead of 404ing.
    const pair = await resolveLocalizedSlug("product", locale, slug);
    if (pair && pair.slug !== slug) {
      permanentRedirect(`/${locale}/products/${encodeURIComponent(pair.slug)}`);
    }
    notFound();
  }

  // A renamed product slug resolves to the entity, but the canonical URL is
  // the current slug (US10.3) — answer with a permanent redirect.
  if (product.canonicalSlug !== slug) {
    permanentRedirect(`/${locale}/products/${encodeURIComponent(product.canonicalSlug)}`);
  }

  const pending = tCommon("contentPending");
  const categoryNames = product.categories.map((category) => category.name).join(", ");
  const specs = specEntries(product.specifications);
  const [primaryImage, ...galleryImages] = product.images;

  // Related products: siblings from the same brand first, otherwise products
  // sharing the first category. Related products render where available.
  let related: PublishedProductSummary[] = (
    await loadProducts(locale, { brandSlug: product.brand.slug })
  )
    .filter((candidate) => candidate.id !== product.id)
    .slice(0, 3);

  if (related.length === 0 && product.categories.length > 0) {
    related = (
      await loadProducts(locale, { categorySlug: product.categories[0].slug })
    )
      .filter((candidate) => candidate.id !== product.id)
      .slice(0, 3);
  }

  return (
    <>
      {/* Product hero — images, name, and the brand/category/country facts. */}
      <Section className="bg-zain-cream-50 pb-16 pt-16 md:pb-20 md:pt-24">
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center text-meta font-semibold text-zain-green-700 underline-offset-4 hover:underline"
        >
          {tCatalog("backToDirectory")}
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <MediaImage
              mediaId={primaryImage?.mediaId ?? null}
              className="aspect-[4/3] w-full rounded-lg"
            />
            {galleryImages.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-3">
                {galleryImages.map((image) => (
                  <li key={image.mediaId}>
                    <MediaImage
                      mediaId={image.mediaId}
                      className="aspect-square w-20 rounded-md"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <h1 className="font-display text-h1 font-medium text-zain-green-950">
              {product.name}
            </h1>

            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tCatalog("filterBrand")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  <Link
                    href={`/brands/${product.brand.slug}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {product.brand.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tCatalog("filterCategory")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  {categoryNames.length > 0 ? categoryNames : pending}
                </dd>
              </div>
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tCatalog("filterCountry")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  {product.countryOfOrigin ?? pending}
                </dd>
              </div>
              {product.sku ? (
                <div>
                  <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                    {tCatalog("skuLabel")}
                  </dt>
                  <dd className="mt-1 text-body text-zain-green-950/85">{product.sku}</dd>
                </div>
              ) : null}
              {product.reference ? (
                <div>
                  <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                    {tCatalog("referenceLabel")}
                  </dt>
                  <dd className="mt-1 text-body text-zain-green-950/85">
                    {product.reference}
                  </dd>
                </div>
              ) : null}
              {product.brochureMediaId ? (
                <div>
                  <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                    {tCatalog("brochureLabel")}
                  </dt>
                  <dd className="mt-1 text-body text-zain-green-950/85">{pending}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </Section>

      {/* Short description. */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="catalog" titleKey="shortDescriptionTitle" />
        <p className="prose-editorial mt-6 max-w-3xl text-body-lg text-zain-green-950/80">
          {product.summary ?? pending}
        </p>
      </Section>

      {/* Full description. */}
      <Section className="bg-zain-cream-50 py-20 md:py-28">
        <SectionHeading namespace="catalog" titleKey="fullDescriptionTitle" />
        <p className="prose-editorial mt-6 max-w-3xl text-body text-zain-green-950/80">
          {product.description ?? pending}
        </p>
      </Section>

      {/* Specifications. */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="catalog" titleKey="specificationsTitle" />
        {specs.length > 0 ? (
          <dl className="mt-8 max-w-3xl divide-y divide-zain-green-950/10">
            {specs.map(([key, value]) => (
              <div key={key} className="flex flex-wrap gap-x-8 gap-y-1 py-4">
                <dt className="min-w-40 text-body font-semibold text-zain-green-950">
                  {key}
                </dt>
                <dd className="text-body text-zain-green-950/80">
                  {renderSpecValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-6 max-w-3xl text-body text-zain-green-950/80">{pending}</p>
        )}
      </Section>

      {/* Related products (where available). */}
      {related.length > 0 ? (
        <Section className="bg-zain-cream-50 py-20 md:py-28">
          <SectionHeading namespace="catalog" titleKey="relatedProducts" />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((candidate) => (
              <li key={candidate.id}>
                <ProductCard product={candidate} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Related brand (FR-009). */}
      <Section className="bg-white py-16 md:py-20">
        <div className="flex flex-col items-start gap-6 rounded-xl border border-zain-green-950/10 bg-zain-cream-50 px-8 py-10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
              {tCatalog("filterBrand")}
            </p>
            <p className="mt-2 font-display text-h3 font-medium text-zain-green-950">
              {product.brand.name}
            </p>
          </div>
          <CtaButton href={`/brands/${product.brand.slug}`} surface="light">
            {product.brand.name}
          </CtaButton>
        </div>
      </Section>

      {/* Inquiry call to action (FR-009). */}
      <Section className="bg-white pb-16 md:pb-20">
        <div className="flex flex-col items-start gap-6 rounded-xl bg-zain-green-950 px-8 py-12 md:flex-row md:items-center md:justify-between md:px-16">
          <p className="max-w-xl font-display text-h3 font-medium text-zain-cream-50">
            {product.name}
          </p>
          <CtaButton
            href={`/contact?type=product&productId=${product.id}&sourcePath=${encodeURIComponent(
              `/products/${product.slug}`,
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
