import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { loadClients } from "@/server/cache/directory-content";
import { buildPublicMetadata } from "@/lib/seo";
import { Section } from "@/components/site/section-heading";
import { ClientCard, EmptyState } from "@/components/site/cards";
import { CtaSection } from "@/components/site/cta-section";

/**
 * Clients directory (T086, FR-012, US8): approved client references only as a
 * card grid — name, logo, industry, location, description, website. A client
 * reference is public ONLY when `disclosureApproved=true AND
 * status='published' AND isActive=true` (data-model §2.6); confidential
 * clients are excluded in the service layer, never filtered in the UI.
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

  const [clients, tClients, tEmpty] = await Promise.all([
    loadClients(locale),
    getTranslations({ locale, namespace: "clients" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return buildPublicMetadata({
    locale,
    path: "/clients",
    title: tClients("pageTitle"),
    description: clients[0]?.description ?? tEmpty("clientsBody"),
  });
}

export default async function ClientsPage({ params }: RouteProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  setRequestLocale(locale);

  const [clients, tClients, tHome, tEmpty] = await Promise.all([
    loadClients(locale),
    getTranslations({ locale, namespace: "clients" }),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "empty" }),
  ]);

  return (
    <>
      <Section className="bg-zain-cream-50 pb-20 pt-16 md:pb-28 md:pt-24">
        <h1 className="font-display text-h1 font-medium text-zain-green-950">
          {tClients("pageTitle")}
        </h1>

        {clients.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <li key={client.id}>
                <ClientCard client={client} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
            <EmptyState title={tEmpty("clientsTitle")} body={tEmpty("clientsBody")} />
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
