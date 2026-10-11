import { hasPermission, type Permission, type Role } from "./permissions";

/**
 * Admin navigation model (T050, FR-021) — derived from the permission matrix
 * (`permissions.ts`, the single source of truth) so the sidebar and the
 * per-module URL guard can never drift from the enforced permissions.
 *
 * Each section maps to `{key}:read`; the label resolves from the `admin`
 * message namespace using the same key. The guard reuses this mapping so a
 * direct navigation to a module a role cannot read is refused server-side
 * (FR-022) — hiding a link is not enforcement.
 */

export interface AdminSection {
  /** Translation key in the `admin` namespace and the URL segment. */
  key: string;
  href: string;
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: "dashboard", href: "/admin" },
  { key: "brands", href: "/admin/brands" },
  { key: "products", href: "/admin/products" },
  { key: "categories", href: "/admin/categories" },
  { key: "suppliers", href: "/admin/suppliers" },
  { key: "clients", href: "/admin/clients" },
  { key: "locations", href: "/admin/locations" },
  { key: "cms", href: "/admin/cms" },
  { key: "media", href: "/admin/media" },
  { key: "seo", href: "/admin/seo" },
  { key: "inquiries", href: "/admin/inquiries" },
  { key: "partnerships", href: "/admin/partnerships" },
  { key: "users", href: "/admin/users" },
  { key: "settings", href: "/admin/settings" },
  { key: "activity", href: "/admin/activity" },
] as const;

/** The `{key}:read` permission required to reach a section, or null if unknown. */
export function sectionPermission(segment: string): Permission | null {
  return ADMIN_SECTIONS.some((section) => section.key === segment)
    ? (`${segment}:read` as Permission)
    : null;
}

/** Section keys a role may read, in menu order. */
export function allowedAdminSections(role: Role): string[] {
  return ADMIN_SECTIONS.filter((section) =>
    hasPermission(role, `${section.key}:read` as Permission),
  ).map((section) => section.key);
}
