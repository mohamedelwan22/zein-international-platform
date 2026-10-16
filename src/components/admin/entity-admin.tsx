import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission, type Permission } from "@/server/auth/permissions";
import {
  getAdminReferences,
  listAdminEntities,
  type AdminResource,
} from "@/server/services/admin";
import { adminListQuerySchema } from "@/server/validation/admin-entities";
import { EntityManager, type EntityPermissions } from "@/components/admin/entity-manager";

/**
 * Shared server surface for the six US7 admin modules (T076–T081, T082).
 *
 * Enforces `{resource}:read` server-side (the static route shadows the shared
 * `[...section]` guard), loads the paginated list and the reference option
 * lists, and hands the client `EntityManager` only the data and booleans it
 * needs. Every write still re-checks the matching permission in the service.
 */

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function EntityAdmin({
  resource,
  locale,
  query,
}: {
  resource: AdminResource;
  locale: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser().catch(() => null);

  if (!user || !hasPermission(user.role, `${resource}:read` as Permission)) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const parsed = adminListQuerySchema.safeParse({
    page: firstParam(query.page),
    pageSize: firstParam(query.pageSize),
    status: firstParam(query.status),
    q: firstParam(query.q),
  });
  const list = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 20, status: undefined, q: undefined };

  const [{ items, total, page, pageSize }, references] = await Promise.all([
    listAdminEntities(resource, list),
    getAdminReferences(),
  ]);

  const permissions: EntityPermissions = {
    create: hasPermission(user.role, `${resource}:create` as Permission),
    update: hasPermission(user.role, `${resource}:update` as Permission),
    delete: hasPermission(user.role, `${resource}:delete` as Permission),
    publish: hasPermission(user.role, `${resource}:publish` as Permission),
    archive: hasPermission(user.role, `${resource}:archive` as Permission),
    visibility: hasPermission(user.role, `${resource}:visibility` as Permission),
  };

  return (
    <EntityManager
      resource={resource}
      locale={locale}
      rows={items}
      total={total}
      page={page}
      pageSize={pageSize}
      q={list.q ?? ""}
      status={list.status ?? ""}
      permissions={permissions}
      categories={references.categories}
      brands={references.brands}
      suppliers={references.suppliers}
    />
  );
}
