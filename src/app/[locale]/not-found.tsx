import { locale as getRootLocale } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { loadContactInfo, loadCurrentYear } from "@/server/cache/public-content";
import { Navbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { CtaButton } from "@/components/site/cta-button";
import { Container } from "@/components/site/container";

/**
 * Localized 404 (T033, FR-039): rendered inside the [locale] layout for
 * every unmatched route. Reuses the public shell (navbar + footer) and the
 * localized message keys; the root-params getter resolves the locale of the
 * URL that failed to match.
 */
export default async function NotFound() {
  const raw = await getRootLocale();
  const locale = isAppLocale(raw) ? raw : "en";

  const [tErrors, tCommon, contact, year] = await Promise.all([
    getTranslations({ locale, namespace: "errors" }),
    getTranslations({ locale, namespace: "common" }),
    loadContactInfo(locale),
    loadCurrentYear(),
  ]);

  return (
    <>
      <Navbar />
      <main id="main-content" className="bg-zain-cream-50">
        <Container className="py-24 md:py-36">
          <p className="font-display text-display font-medium text-zain-green-700">404</p>
          <h1 className="mt-4 font-display text-h1 font-medium text-zain-green-950">
            {tErrors("notFoundTitle")}
          </h1>
          <p className="prose-editorial mt-4 max-w-xl text-body-lg text-zain-green-950/80">
            {tErrors("notFoundBody")}
          </p>
          <div className="mt-10">
            <CtaButton href="/" surface="light">
              {tCommon("backToHome")}
            </CtaButton>
          </div>
        </Container>
      </main>
      <SiteFooter contact={contact} year={year} />
    </>
  );
}
