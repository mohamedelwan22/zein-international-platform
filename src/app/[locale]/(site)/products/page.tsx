import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import {
  loadBrands,
  loadCategories,
  loadProducts,
} from "@/server/cache/catalog-content";
import type {
  CatalogFilters as CatalogFilterInput,
} from "@/server/services/catalog";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { ProductCard, EmptyState } from "@/components/site/cards";
import {
  CatalogFilters,
  type CatalogFilterValues,
} from "@/components/site/catalog-filters";
import { CtaSection } from "@/components/site/cta-section";

/**
 * Product catalog (T043, FR-009): browsing with brand / category /
 * country-of-origin filters that combine through query parameters and clear
 * with one action. Reads are published-only (status='published' AND
 * isActive=true, plus the published brand/category joins); a zero-record
 * catalog — unfiltered or filtered — renders a localized empty state, never a
 * blank page. No price, stock, cart, or any e-commerce surface (FR-010).
 *
 * Cache Components (T043): `searchParams` drive the filters, so the shell
 * (heading, chrome, closing CTA) prerenders statically while the filtered
 * catalog streams inside `<Suspense>` — the documented pattern for query
 * parameters. The underlying reads stay cached (`use cache` + tags).
 */

type SearchParams = Record<string, string | string[] | undefined>;

interface RouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}

function resolveLocale(raw: string): AppLocale {
  return isAppLocale(raw) ? raw : "en";
}

/**
 * Read the FR-009 filters from the query string. Unknown or blank parameters
 * are ignored (never invented into a filter); repeated parameters take the
 * first value.
 */
function parseFilters(searchParams: SearchParams): {
  values: CatalogFilterValues;
  filters: CatalogFilterInput;
  hasFilters: boolean;
} {
  const read = (key: string) => {
    const raw = searchParams[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return value ? value : undefined;
  };

  const values: CatalogFilterValues = {
    brand: read("brand"),
    category: read("category"),
    country: read("country"),
  };

  return {
    values,
    filters: {
      brandSlug: values.brand,
      categorySlug: values.category,
      country: values.country,
    },
    hasFilters: Boolean(values.brand || values.category || values.country),
  };
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);

  const [products, tCatalog, tEmpty] = await Promise.all([
    loadProducts(locale),
    getTranslations({ locale, namespace: "catalog" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/products",
    title: tCatalog("pageTitle"),
    description: products[0]?.summary ?? tEmpty("productsBody"),
  });
}

/** Static shell placeholder shown while the filtered catalog streams in. */
function CatalogFallback({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-12">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-10 lg:flex-row">
        <div className="h-64 w-full shrink-0 rounded-lg bg-white/70 lg:w-64" />
        <div className="grid flex-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-64 rounded-lg bg-white/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The streamed catalog: filter sidebar + result grid or localized empty state. */
async function ProductCatalog({
  locale,
  searchParams,
}: {
  locale: AppLocale;
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const { values, filters, hasFilters } = parseFilters(resolved);

  const [products, allProducts, brands, categories, tCatalog, tEmpty] =
    await Promise.all([
      loadProducts(locale, filters),
      loadProducts(locale),
      loadBrands(locale),
      loadCategories(locale),
      getTranslations({ locale, namespace: "catalog" }),
      getTranslations({ locale, namespace: "empty" }),
    ]);

  // Country filter options are the verified country-of-origin facts that
  // actually occur in the published catalog — never an invented list.
  const countries = [
    ...new Set(
      allProducts.flatMap((product) =>
        product.countryOfOrigin ? [product.countryOfOrigin] : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:gap-12">
      <aside className="shrink-0 rounded-lg border border-zain-green-950/10 bg-white p-6 lg:w-64">
        <CatalogFilters
          options={{
            brands: brands.map((brand) => ({ slug: brand.slug, name: brand.name })),
            categories: categories.map((category) => ({
              slug: category.slug,
              name: category.name,
            })),
            countries,
          }}
          values={values}
        />
      </aside>

      <div className="min-w-0 flex-1">
        {products.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={hasFilters ? tCatalog("noMatchTitle") : tEmpty("productsTitle")}
            body={hasFilters ? tCatalog("noMatchBody") : tEmpty("productsBody")}
          />
        )}
      </div>
    </div>
  );
}

export default async function ProductsPage({ params, searchParams }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [tCatalog, tHome, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "common" }),
  ]);

  return (
    <>
      <Section className="bg-zain-cream-50 pb-20 pt-16 md:pb-28 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tCatalog("pageTitle")}
        </h1>

        <Suspense fallback={<CatalogFallback label={tCommon("loading")} />}>
          <ProductCatalog locale={locale} searchParams={searchParams} />
        </Suspense>
      </Section>

      <CtaSection
        title={tHome("closingCtaTitle")}
        primary={{ href: "/contact", label: tHome("closingCtaPrimary") }}
      />
    </>
  );
}
