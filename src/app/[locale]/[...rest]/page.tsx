import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { locale as getRootLocale } from "next/root-params";
import { isAppLocale } from "@/i18n/routing";

/**
 * Unmatched-path catch-all (T033, FR-039): any URL under /[locale]/… that
 * no route matches lands here and triggers the localized 404 boundary
 * (`src/app/[locale]/not-found.tsx`), which renders inside the per-locale
 * layout with the correct `lang`/`dir`. Static routes always take
 * precedence over this segment.
 *
 * The locale is read through `next/root-params` (statically known from the
 * root layout's generateStaticParams) so the route prerenders its shell
 * without resolving the unknown `rest` segments at build time.
 */
export default async function CatchAllPage() {
  const locale = await getRootLocale();
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  notFound();
}
