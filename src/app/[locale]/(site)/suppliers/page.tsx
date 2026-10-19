import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadSuppliers } from "@/server/cache/directory-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { EmptyState, SupplierCard } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";

/**
 * Suppliers directory (T085, FR-011, US8): the disclosed supplier network as a
 * card grid — logo, name, origin country, categories, short description.
 * Reads are disclosure-gated and published-only (`disclosureApproved=true AND
 * status='published' AND isActive=true`); a zero-record directory renders the
 * localized empty state, never a blank page or a partial disclosure.
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

  const [suppliers, tSuppliers, tEmpty] = await Promise.all([
    loadSuppliers(locale),
    getTranslations({ locale, namespace: "suppliers" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/suppliers",
    title: tSuppliers("pageTitle"),
    description: suppliers[0]?.summary ?? tEmpty("suppliersBody"),
  });
}

export default async function SuppliersPage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [suppliers, tSuppliers, tHome, tEmpty] = await Promise.all([
    loadSuppliers(locale),
    getTranslations({ locale, namespace: "suppliers" }),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return (
    <>
      <Section className="bg-zain-cream-50 pb-20 pt-16 md:pb-28 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tSuppliers("pageTitle")}
        </h1>

        {suppliers.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((supplier) => (
              <li key={supplier.id}>
                <SupplierCard supplier={supplier} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
            <EmptyState title={tEmpty("suppliersTitle")} body={tEmpty("suppliersBody")} />
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
