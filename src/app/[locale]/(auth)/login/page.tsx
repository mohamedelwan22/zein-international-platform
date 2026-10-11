import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { LoginForm } from "@/components/admin/login-form";

/**
 * T049 [US3] — admin sign-in page (FR-003). Content is localized via the
 * `auth` namespace; the page is noindex (it is not public content, FR-040).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("signInTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("auth");

  return (
    <section className="rounded-xl bg-zain-cream-50 p-8 shadow-xl shadow-zain-black/20">
      <h1 className="mb-6 text-h3 font-bold text-zain-green-950">{t("signInTitle")}</h1>
      <LoginForm locale={locale} />
    </section>
  );
}
