"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Catalog filter sidebar (T043, FR-009): brand / category / country-of-origin
 * comboboxes that combine through shared query parameters, plus one action
 * that clears them all. State lives in the URL (`?brand=&category=&country=`)
 * so a filtered catalog location is shareable and the language switch
 * preserves the active filters (SC-001 parity).
 *
 * Cache Components: this leaf reads `useSearchParams()` and is rendered
 * inside the products page's `<Suspense>` boundary.
 */

export interface CatalogFilterOption {
  slug: string;
  name: string;
}

export interface CatalogFilterValues {
  brand?: string;
  category?: string;
  country?: string;
}

export interface CatalogFilterOptions {
  brands: CatalogFilterOption[];
  categories: CatalogFilterOption[];
  countries: string[];
}

const FILTER_KEYS = ["brand", "category", "country"] as const;

export function CatalogFilters({
  options,
  values,
}: {
  options: CatalogFilterOptions;
  values: CatalogFilterValues;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const apply = (key: (typeof FILTER_KEYS)[number], value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const clear = () => {
    router.push(pathname, { scroll: false });
  };

  const hasActive = FILTER_KEYS.some((key) => values[key]);

  const selectClass =
    "min-h-11 w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label
          htmlFor="catalog-filter-brand"
          className="text-meta font-semibold uppercase tracking-wide text-zain-green-700"
        >
          {t("filterBrand")}
        </label>
        <select
          id="catalog-filter-brand"
          className={`mt-2 ${selectClass}`}
          value={values.brand ?? ""}
          onChange={(event) => apply("brand", event.target.value)}
        >
          <option value="">{t("allOption")}</option>
          {options.brands.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="catalog-filter-category"
          className="text-meta font-semibold uppercase tracking-wide text-zain-green-700"
        >
          {t("filterCategory")}
        </label>
        <select
          id="catalog-filter-category"
          className={`mt-2 ${selectClass}`}
          value={values.category ?? ""}
          onChange={(event) => apply("category", event.target.value)}
        >
          <option value="">{t("allOption")}</option>
          {options.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="catalog-filter-country"
          className="text-meta font-semibold uppercase tracking-wide text-zain-green-700"
        >
          {t("filterCountry")}
        </label>
        <select
          id="catalog-filter-country"
          className={`mt-2 ${selectClass}`}
          value={values.country ?? ""}
          onChange={(event) => apply("country", event.target.value)}
        >
          <option value="">{t("allOption")}</option>
          {options.countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={clear}
        disabled={!hasActive}
        className="inline-flex min-h-11 items-center justify-center rounded-sm border border-zain-green-950/25 px-4 py-2.5 text-body font-semibold text-zain-green-950 transition-colors hover:border-zain-green-950/50 hover:bg-zain-green-950/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("clearFilters")}
      </button>
    </div>
  );
}
