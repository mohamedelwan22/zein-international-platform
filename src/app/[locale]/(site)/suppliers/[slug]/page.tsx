import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import { loadSupplierDetail } from "@/server/cache/directory-content";
import { resolveLocalizedSlug } from "@/server/services/catalog";
import { listPublicSuppliers } from "@/server/services/directory";
import { buildPublicMetadata } from "@/lib/seo";
import { decodeSlugParam } from "@/lib/slug";
import { Section, SectionHeading } from "@/components/site/section-heading";
import { ProductCard, EmptyState } from "@/components/site/cards";
import { MediaImage } from "@/components/site/media-image";
import { CtaButton } from "@/components/site/cta-button";
import { Link } from "@/i18n/navigation";

/**
 * Supplier detail (T085, FR-011, US8): logo, cover, name, origin country,
 * categories, about, history, the supplier's published products, approved
 * contact channels, and an inquiry call to action — all bilingual and
 * admin-managed. A supplier that is undisclosed, unpublished, or unknown (or a
 * redirected slug) yields the localized 404; the SlugRedirect is resolved
 * inside the directory service (data-model §2.11). Cross-locale slugs resolve
 * to a redirect (BUG-002 behavior), mirroring the brand detail page.
 */

export const instant = false;

interface RouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

function resolveLocale(raw: string): AppLocale {
  return isAppLocale(raw) ? raw : "en";
}

/**
 * Prerender a page per disclosed supplier slug, per locale (slugs are
 * localized). Slugs published after a build are runtime params. Cache
 * Components requires at least one param, so an empty directory falls back to
 * a sentinel that the page resolves to the 404.
 */
export async function generateStaticParams() {
  const perLocale = await Promise.all(
    routing.locales.map(async (locale) => {
      const suppliers = await listPublicSuppliers(locale);
      return suppliers.map((supplier) => ({ locale, slug: supplier.slug }));
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

  const [supplier, tSuppliers, tEmpty] = await Promise.all([
    loadSupplierDetail(locale, slug),
    getTranslations({ locale, namespace: "suppliers" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  // Slugs are localized, so each locale's detail URL differs (BUG-002).
  const pair = supplier ? await resolveLocalizedSlug("supplier", locale, slug) : null;
  const languagePaths = pair
    ? {
        en: `/suppliers/${locale === "en" ? pair.slug : pair.alternateSlug}`,
        ar: `/suppliers/${locale === "ar" ? pair.slug : pair.alternateSlug}`,
      }
    : undefined;

  return buildPublicMetadata({
    locale,
    path: `/suppliers/${slug}`,
    title: supplier?.name ?? tSuppliers("pageTitle"),
    description:
      supplier?.summary ?? supplier?.description ?? tEmpty("suppliersBody"),
    languagePaths,
  });
}

export default async function SupplierDetailPage({ params }: RouteProps) {
  const { locale: raw, slug: rawSlug } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const slug = decodeSlugParam(rawSlug);
  setRequestLocale(locale);

  const [supplier, tSuppliers, tInquiry, tCommon, tEmpty] = await Promise.all([
    loadSupplierDetail(locale, slug),
    getTranslations({ locale, namespace: "suppliers" }),
    getTranslations({ locale, namespace: "inquiry" }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  if (!supplier) {
    // The slug may be the OTHER locale's slug — e.g. a locale switch or a
    // shared link that swapped only the prefix (BUG-002). Resolve it to this
    // locale's canonical slug and redirect there instead of 404ing.
    const pair = await resolveLocalizedSlug("supplier", locale, slug);
    if (pair && pair.slug !== slug) {
      permanentRedirect(`/${locale}/suppliers/${encodeURIComponent(pair.slug)}`);
    }
    notFound();
  }

  const pending = tCommon("contentPending");
  const categoryNames = supplier.categories.map((category) => category.name).join(", ");
  const hasContact = Boolean(supplier.website || supplier.phone || supplier.email);

  return (
    <>
      {/* Supplier hero — cover, logo, name, and the country/category facts. */}
      <Section className="bg-zain-cream-50 pb-16 pt-16 md:pb-20 md:pt-24">
        <Link
          href="/suppliers"
          className="inline-flex min-h-11 items-center text-meta font-semibold text-zain-green-700 underline-offset-4 hover:underline"
        >
          {tSuppliers("backToDirectory")}
        </Link>

        <MediaImage
          mediaId={supplier.coverMediaId}
          className="mt-6 aspect-[16/6] w-full rounded-lg"
        />

        <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-start">
          <MediaImage
            mediaId={supplier.logoMediaId}
            className="aspect-square w-28 shrink-0 rounded-lg md:w-36"
          />
          <div className="flex-1">
            <h1 className="font-display text-h1 font-medium text-zain-green-950">
              {supplier.name}
            </h1>

            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tSuppliers("countryLabel")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  {supplier.originCountry ?? pending}
                </dd>
              </div>
              <div>
                <dt className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
                  {tSuppliers("categoryLabel")}
                </dt>
                <dd className="mt-1 text-body text-zain-green-950/85">
                  {categoryNames.length > 0 ? categoryNames : pending}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      {/* About — the approved supplier summary. */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="suppliers" titleKey="aboutLabel" />
        <p className="prose-editorial mt-6 max-w-3xl text-body-lg text-zain-green-950/80">
          {supplier.summary ?? supplier.description ?? pending}
        </p>
      </Section>

      {/* History. */}
      <Section className="bg-zain-cream-50 py-20 md:py-28">
        <SectionHeading namespace="suppliers" titleKey="historyTitle" />
        <p className="prose-editorial mt-6 max-w-3xl text-body text-zain-green-950/80">
          {supplier.history ?? pending}
        </p>
      </Section>

      {/* The supplier's published products (FR-011). */}
      <Section className="bg-white py-20 md:py-28">
        <SectionHeading namespace="suppliers" titleKey="productsTitleLabel" />
        {supplier.products.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {supplier.products.map((product) => (
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

      {/* Approved contact channels (FR-011). */}
      {hasContact ? (
        <Section className="bg-zain-cream-50 py-20 md:py-28">
          <SectionHeading namespace="suppliers" titleKey="contactTitle" />
          <ul className="mt-8 flex max-w-2xl flex-col gap-1">
            {supplier.website ? (
              <li>
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-body text-zain-green-700 underline-offset-4 hover:underline"
                >
                  {tSuppliers("websiteLabel")}: {supplier.website}
                </a>
              </li>
            ) : null}
            {supplier.phone ? (
              <li>
                <a
                  href={`tel:${supplier.phone}`}
                  dir="ltr"
                  className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                >
                  {tSuppliers("phoneLabel")}: {supplier.phone}
                </a>
              </li>
            ) : null}
            {supplier.email ? (
              <li>
                <a
                  href={`mailto:${supplier.email}`}
                  className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                >
                  {tSuppliers("emailLabel")}: {supplier.email}
                </a>
              </li>
            ) : null}
          </ul>
        </Section>
      ) : null}

      {/* Inquiry call to action (FR-011). */}
      <Section className="bg-white py-16 md:py-20">
        <div className="flex flex-col items-start gap-6 rounded-xl bg-zain-green-950 px-8 py-12 md:flex-row md:items-center md:justify-between md:px-16">
          <p className="max-w-xl font-display text-h3 font-medium text-zain-cream-50">
            {supplier.name}
          </p>
          <CtaButton
            href={`/contact?type=supplier&supplierId=${supplier.id}&sourcePath=${encodeURIComponent(
              `/suppliers/${supplier.slug}`,
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
