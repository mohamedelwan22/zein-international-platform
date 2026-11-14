import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PublishedCategoryPreview } from "@/server/services/categories";
import type {
  PublishedBrandSummary,
  PublishedFeaturedProduct,
  PublishedProductSummary,
} from "@/server/services/catalog";
import type {
  PublicClientSummary,
  PublicSupplierSummary,
} from "@/server/services/directory";
import type { AboutSection } from "@/server/validation/cms";
import { MediaImage } from "./media-image";

/**
 * Catalog preview cards (T034/T035/T042/T043). Pure presentational surfaces
 * for CMS/database-driven data — no business content hardcoded (FR-038).
 */

export function CategoryCard({ category }: { category: PublishedCategoryPreview }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-zain-green-950/10 bg-white p-8 transition-shadow hover:shadow-lg hover:shadow-zain-green-950/5">
      <h3 className="font-display text-h3 font-medium text-zain-green-950">
        {category.name}
      </h3>
      {category.description ? (
        <p className="mt-4 text-body text-zain-green-950/75">{category.description}</p>
      ) : null}
    </article>
  );
}

export function ValueCard({
  value,
}: {
  value: AboutSection["values"][number];
}) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-zain-green-950/10 bg-white p-8">
      {/* One consistent icon language (DESIGN_SYSTEM §38) — a single
          refined gold leaf mark, shared by all seven values. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        strokeWidth="1.2"
        stroke="currentColor"
        fill="none"
        className="h-8 w-8 text-zain-gold-500"
      >
        <path
          d="M12 21c-4.5-2.6-7.5-6.2-7.5-10.2C4.5 6.4 7.8 3.5 12 3c4.2.5 7.5 3.4 7.5 7.8 0 4-3 7.6-7.5 10.2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 21V9.5c1.8-2 4-2.6 6-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h3 className="mt-5 text-h3 font-semibold text-zain-green-950">{value.title}</h3>
      <p className="mt-3 text-body text-zain-green-950/75">{value.description}</p>
    </article>
  );
}

/**
 * Brand directory card (T042, FR-008): logo, name, country, category, short
 * description, and featured status. The whole card is a single link to the
 * brand detail page.
 */
export function BrandCard({ brand }: { brand: PublishedBrandSummary }) {
  const t = useTranslations("brands");

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-zain-green-950/10 bg-white transition-shadow hover:shadow-lg hover:shadow-zain-green-950/5">
      <Link href={`/brands/${brand.slug}`} className="flex h-full flex-col">
        <MediaImage mediaId={brand.logoMediaId} className="aspect-[4/3] w-full" />
        <div className="flex flex-1 flex-col p-8">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-h3 font-medium text-zain-green-950">
              {brand.name}
            </h2>
            {brand.featured ? (
              <span className="shrink-0 rounded-full bg-zain-gold-500/15 px-3 py-1 text-meta font-semibold text-zain-green-800">
                {t("featuredBadge")}
              </span>
            ) : null}
          </div>

          {brand.originCountry ? (
            <p className="mt-3 text-meta text-zain-green-950/70">
              <span className="font-semibold text-zain-green-700">{t("countryLabel")}</span>{" "}
              {brand.originCountry}
            </p>
          ) : null}

          {brand.summary ? (
            <p className="mt-4 text-body text-zain-green-950/75">{brand.summary}</p>
          ) : null}

          {brand.categories.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {brand.categories.map((category) => (
                <li
                  key={category.id}
                  className="rounded-full border border-zain-green-950/10 px-3 py-1 text-meta text-zain-green-950/70"
                >
                  {category.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/**
 * Supplier directory card (T085, FR-011): disclosed suppliers only — logo,
 * name, origin country, categories, and short description. The whole card links
 * to the supplier detail page.
 */
export function SupplierCard({ supplier }: { supplier: PublicSupplierSummary }) {
  const t = useTranslations("suppliers");

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-zain-green-950/10 bg-white transition-shadow hover:shadow-lg hover:shadow-zain-green-950/5">
      <Link href={`/suppliers/${supplier.slug}`} className="flex h-full flex-col">
        <MediaImage mediaId={supplier.logoMediaId} className="aspect-[4/3] w-full" />
        <div className="flex flex-1 flex-col p-8">
          <h2 className="font-display text-h3 font-medium text-zain-green-950">
            {supplier.name}
          </h2>

          {supplier.originCountry ? (
            <p className="mt-3 text-meta text-zain-green-950/70">
              <span className="font-semibold text-zain-green-700">{t("countryLabel")}</span>{" "}
              {supplier.originCountry}
            </p>
          ) : null}

          {supplier.summary ? (
            <p className="mt-4 text-body text-zain-green-950/75">{supplier.summary}</p>
          ) : null}

          {supplier.categories.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {supplier.categories.map((category) => (
                <li
                  key={category.id}
                  className="rounded-full border border-zain-green-950/10 px-3 py-1 text-meta text-zain-green-950/70"
                >
                  {category.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/**
 * Client reference card (T086, FR-012): ONLY approved public fields are ever
 * passed in — name, logo, industry, location, description, and website. No
 * confidential data reaches this surface.
 */
export function ClientCard({ client }: { client: PublicClientSummary }) {
  const t = useTranslations("clients");

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-zain-green-950/10 bg-white">
      <MediaImage mediaId={client.logoMediaId} className="aspect-[3/2] w-full" />
      <div className="flex flex-1 flex-col p-8">
        <h2 className="font-display text-h3 font-medium text-zain-green-950">
          {client.name}
        </h2>

        {client.industry ? (
          <p className="mt-3 text-meta text-zain-green-950/70">
            <span className="font-semibold text-zain-green-700">{t("industryLabel")}</span>{" "}
            {client.industry}
          </p>
        ) : null}

        {client.location ? (
          <p className="mt-1 text-meta text-zain-green-950/70">
            <span className="font-semibold text-zain-green-700">{t("locationLabel")}</span>{" "}
            {client.location}
          </p>
        ) : null}

        {client.description ? (
          <p className="mt-4 text-body text-zain-green-950/75">{client.description}</p>
        ) : null}

        {client.website ? (
          <a
            href={client.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
          >
            {t("websiteLabel")}
          </a>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Product card (T043, FR-009): bilingual name, brand, country of origin, short
 * description, categories. Informational only — no price, stock, cart, or any
 * e-commerce affordance (FR-010). The whole card links to the product detail.
 */
export function ProductCard({ product }: { product: PublishedProductSummary }) {
  const t = useTranslations("catalog");

  return (
    <article className="flex h-full flex-col rounded-lg border border-zain-green-950/10 bg-white p-8 transition-shadow hover:shadow-lg hover:shadow-zain-green-950/5">
      <Link href={`/products/${product.slug}`} className="flex h-full flex-col">
        <h3 className="font-display text-h3 font-medium text-zain-green-950">
          {product.name}
        </h3>

        <p className="mt-2 text-meta text-zain-green-950/70">
          <span className="font-semibold text-zain-green-700">{t("filterBrand")}</span>{" "}
          {product.brand.name}
        </p>

        {product.countryOfOrigin ? (
          <p className="mt-1 text-meta text-zain-green-950/70">
            <span className="font-semibold text-zain-green-700">{t("filterCountry")}</span>{" "}
            {product.countryOfOrigin}
          </p>
        ) : null}

        {product.summary ? (
          <p className="mt-4 text-body text-zain-green-950/75">{product.summary}</p>
        ) : null}

        {product.categories.length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {product.categories.map((category) => (
              <li
                key={category.id}
                className="rounded-full border border-zain-green-950/10 px-3 py-1 text-meta text-zain-green-950/70"
              >
                {category.name}
              </li>
            ))}
          </ul>
        ) : null}
      </Link>
    </article>
  );
}

/**
 * Featured product card for the Home preview (FR-006): primary image, name,
 * associated brand, short description, and an explicit "View product" link.
 * The whole card is a single link to the product detail page.
 */
export function FeaturedProductCard({ product }: { product: PublishedFeaturedProduct }) {
  const tCatalog = useTranslations("catalog");

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-zain-green-950/10 bg-white transition-shadow hover:shadow-lg hover:shadow-zain-green-950/5">
      <Link href={`/products/${product.slug}`} className="flex h-full flex-col">
        {product.primaryImageMediaId ? (
          <MediaImage
            mediaId={product.primaryImageMediaId}
            className="aspect-[4/3] w-full"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex aspect-[4/3] w-full items-center justify-center bg-zain-cream-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="h-12 w-12 text-zain-green-950/25"
            >
              <path
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M3.3 7L12 12l8.7-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 22V12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <div className="flex flex-1 flex-col p-8">
          <h3 className="font-display text-h3 font-medium text-zain-green-950">
            {product.name}
          </h3>

          <p className="mt-2 text-meta text-zain-green-950/70">
            <span className="font-semibold text-zain-green-700">{tCatalog("filterBrand")}</span>{" "}
            {product.brand.name}
          </p>

          {product.summary ? (
            <p className="mt-4 text-body text-zain-green-950/75">{product.summary}</p>
          ) : null}

          <span className="mt-auto inline-flex items-center gap-2 pt-6 text-body font-semibold text-zain-green-700">
            {tCatalog("viewProduct")}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              fill="none"
              className="h-4 w-4 rtl:-scale-x-100"
            >
              <path d="M5 12h14m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </Link>
    </article>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white/60 p-12 text-center">
      <h3 className="font-display text-h3 font-medium text-zain-green-950">{title}</h3>
      <p className="mx-auto mt-3 max-w-md text-body text-zain-green-950/70">{body}</p>
    </div>
  );
}
