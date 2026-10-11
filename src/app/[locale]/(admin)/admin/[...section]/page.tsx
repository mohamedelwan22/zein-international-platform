import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { sectionPermission } from "@/server/auth/admin-nav";

/**
 * T050 [US3] — per-module access guard (FR-022).
 *
 * Maps an admin URL segment to `{segment}:read` and enforces it against the
 * signed-in role's permission matrix. A known section the role may not read
 * renders an explicit "Access denied" surface (not a silent 404), so a direct
 * navigation attempt is visibly refused; a permitted section renders a
 * localized placeholder until its module page ships (US7/US12/…). Unknown
 * segments are a 404. Hiding sidebar links is only UX — this is enforcement.
 *
 * The admin layout already guarantees a verified session; this re-reads it so
 * the guard is self-contained and each future module page inherits the same
 * boundary.
 */
// Reads the session at request time (uncached) to enforce the guard, so this
// segment opts out of instant-navigation validation like the admin layout.
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("dashboard"), robots: { index: false, follow: false } };
}

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string[] }>;
}) {
  const { locale, section } = await params;
  setRequestLocale(locale);

  if (section.length !== 1) {
    notFound();
  }
  const segment = section[0];
  const permission = sectionPermission(segment);
  if (!permission) {
    notFound();
  }

  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser();
  const allowed = !!user && hasPermission(user.role, permission);

  if (!allowed) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h2 font-bold text-zain-green-950">{t(segment)}</h1>
      <p className="text-body text-zain-charcoal">
        {t("modulePlaceholder", { module: t(segment) })}
      </p>
    </section>
  );
}
