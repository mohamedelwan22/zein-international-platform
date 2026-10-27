"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { ADMIN_SECTIONS } from "@/server/auth/admin-nav";
import { signOutAction } from "@/server/auth/actions";

/**
 * T050/T051 [US3] — admin sidebar (FR-021).
 *
 * Renders only the modules the signed-in role may read (`sections`, computed
 * server-side from the permission matrix) and marks the active route with
 * `aria-current="page"`. Hiding a link is a UX affordance, not the security
 * boundary — the admin layout and per-module guard enforce access server-side
 * (FR-022).
 */
export function AdminSidebar({
  sections,
  userName,
  locale,
}: {
  sections: string[];
  userName: string;
  locale: string;
}) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();

  const items = ADMIN_SECTIONS.filter((section) => sections.includes(section.key));

  return (
    <aside className="flex h-dvh w-full flex-col gap-6 overflow-y-auto bg-zain-green-900 p-5 text-zain-cream-50 md:fixed md:inset-y-0 md:start-0 md:w-[17rem]">
      <p className="text-body font-semibold">{t("welcome", { name: userName })}</p>

      <nav aria-label={t("navLabel")} className="min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {items.map((section) => {
            const active =
              section.key === "dashboard"
                ? pathname === "/admin"
                : pathname.startsWith(section.href);
            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-body transition-colors ${
                    active
                      ? "bg-zain-green-700 font-semibold text-zain-white"
                      : "text-zain-cream-100 hover:bg-zain-green-800 hover:text-zain-white"
                  }`}
                >
                  {t(section.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 border-t border-zain-cream-50/15 pt-4">
        <Link
          href="/"
          className="rounded-md px-3 py-2 text-body text-zain-cream-100 hover:text-zain-white"
        >
          {t("backToSite")}
        </Link>
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="w-full rounded-md border border-zain-cream-50/30 px-3 py-2 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zain-gold-500"
          >
            {tAuth("signOut")}
          </button>
        </form>
      </div>
    </aside>
  );
}
