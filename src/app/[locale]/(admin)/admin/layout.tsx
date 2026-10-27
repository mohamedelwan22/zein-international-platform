import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { allowedAdminSections } from "@/server/auth/admin-nav";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SessionGuard } from "@/components/admin/session-guard";

/**
 * T050 [US3] — admin shell (FR-021/FR-022).
 *
 * The single server-side gate for the whole admin area: with no verified
 * session the request is redirected to the localized sign-in page *before any
 * admin HTML is produced*. The sidebar is built directly from the permission
 * matrix (`allowedAdminSections`), so the visible modules always match the
 * enforced permissions for the signed-in role. A revoked/stale token surfaces
 * as an `HttpError` and is treated as unauthenticated.
 *
 * `instant = false` opts this auth-gated segment out of instant-navigation
 * validation, keeping the redirect on the server (Cache Components guide,
 * "Migrating an existing app").
 */
export const instant = false;

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const user = await getSessionUser().catch(() => null);
  if (!user) {
    redirect({ href: "/login", locale });
    return null;
  }

  const sections = allowedAdminSections(user.role);
  const t = await getTranslations("common");

  return (
    <div className="bg-zain-cream-100">
      <a
        href="#main-content"
        className="skip-link rounded-sm bg-zain-cream-50 px-4 py-3 text-body font-semibold text-zain-green-950"
      >
        {t("skipToContent")}
      </a>
      <div className="hidden md:block">
        <AdminSidebar sections={sections} userName={user.name} locale={locale} />
      </div>
      <div className="md:hidden">
        <AdminSidebar sections={sections} userName={user.name} locale={locale} />
      </div>
      <main
        id="main-content"
        className="min-h-dvh overflow-x-hidden p-6 md:ms-[17rem] md:h-dvh md:min-h-0 md:overflow-y-auto md:overflow-x-hidden md:p-10"
      >
        {children}
      </main>
      <SessionGuard />
    </div>
  );
}
