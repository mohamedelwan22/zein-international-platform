import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PublishedCategoryPreview } from "@/server/services/categories";
import type {
  PublishedBrandSummary,
  PublishedProductSummary,
} from "@/server/services/catalog";
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

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white/60 p-12 text-center">
      <h3 className="font-display text-h3 font-medium text-zain-green-950">{title}</h3>
      <p className="mx-auto mt-3 max-w-md text-body text-zain-green-950/70">{body}</p>
    </div>
  );
}
