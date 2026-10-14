import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { listUsers } from "@/server/services/users";
import { userListQuerySchema } from "@/server/validation/users";
import { UsersManager, type UserRowData } from "@/components/admin/users-manager";

/**
 * Admin Users module (US12, T090, admin-api.md §8, FR-021/FR-022).
 *
 * Enforces `users:read` server-side (the static route shadows the shared
 * `[...section]` guard) and lists staff without password hashes. The create
 * control shows only for `users:create`, row actions only for `users:update`;
 * `POST/PUT /api/admin/users*` re-enforce both server-side.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("users"), robots: { index: false, follow: false } };
}

export default async function AdminUsersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser().catch(() => null);

  if (!user || !hasPermission(user.role, "users:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const query = await searchParams;
  const parsed = userListQuerySchema.safeParse({
    page: firstParam(query.page),
    pageSize: firstParam(query.pageSize),
  });
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 50 };

  const { items, total } = await listUsers({ page, pageSize });
  const rows: UserRowData[] = items.map((item) => ({
    id: item.id,
    email: item.email,
    name: item.name,
    role: item.role,
    active: item.active,
    version: item.version,
    lastLoginAt: item.lastLoginAt ? item.lastLoginAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  }));

  return (
    <>
      <UsersManager
        users={rows}
        canCreate={hasPermission(user.role, "users:create")}
        canUpdate={hasPermission(user.role, "users:update")}
        currentUserId={user.id}
        locale={locale}
      />
      {total > pageSize ? (
        <p className="mt-4 text-meta text-zain-charcoal">
          {t("pageSummary", { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}
        </p>
      ) : null}
    </>
  );
}
