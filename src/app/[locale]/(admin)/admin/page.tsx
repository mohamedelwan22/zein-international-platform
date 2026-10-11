import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * T051 [US3] — admin landing placeholder (post-login destination).
 *
 * The full dashboard (counts, entry points, recent activity) lands in US11
 * (T108); until then this confirms a verified session reached the admin area
 * and gives each module a stable home. Noindex (not public content).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("dashboard"), robots: { index: false, follow: false } };
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h2 font-bold text-zain-green-950">{t("dashboard")}</h1>
      <p className="text-body text-zain-charcoal">{t("modulePlaceholder", { module: t("dashboard") })}</p>
    </section>
  );
}
