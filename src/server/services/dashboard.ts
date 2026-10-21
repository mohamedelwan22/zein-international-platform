import { prisma } from "@/server/db/prisma";
import { hasPermission, type Role } from "@/server/auth/permissions";
import { listRecentActivity, type ActivityLogEntry } from "@/server/services/activity";

/**
 * Admin dashboard service (T108, US11, FR-023, contracts/admin-api.md §2).
 *
 * The overview answers two questions for a signed-in staff member:
 *  1. what does the platform hold right now — a count per module, each count
 *     scoped to what the signed-in role is allowed to see (FR-022 — a count is
 *     data too, so a role without `inquiries:read` never receives the
 *     inquiry count);
 *  2. what happened recently — the newest entries of the append-only activity
 *     log (SC-012).
 *
 * Every module is also an entry point: the dashboard links straight into the
 * module the count belongs to.
 */

export interface DashboardCount {
  total: number;
  published: number;
}

export interface DashboardLeadCount {
  total: number;
  new: number;
}

export interface DashboardMediaCount {
  total: number;
  archived: number;
}

export interface DashboardCounts {
  brands: DashboardCount;
  products: DashboardCount;
  categories: DashboardCount;
  suppliers: DashboardCount;
  clients: DashboardCount;
  locations: DashboardCount;
  content: DashboardCount;
  media: DashboardMediaCount;
  inquiries: DashboardLeadCount;
  partnerships: DashboardLeadCount;
}

export interface DashboardEntryPoint {
  /** Admin section key (`admin-nav.ts`). */
  key: string;
  /** Locale-less admin path. */
  href: string;
}

export interface DashboardOverview {
  counts: Partial<DashboardCounts>;
  entryPoints: DashboardEntryPoint[];
  recentActivity: ActivityLogEntry[];
  generatedAt: string;
}

/** The counted modules — key, count bucket and admin path. */
const MODULES = [
  { key: "brands", count: "brands", href: "/admin/brands" },
  { key: "products", count: "products", href: "/admin/products" },
  { key: "categories", count: "categories", href: "/admin/categories" },
  { key: "suppliers", count: "suppliers", href: "/admin/suppliers" },
  { key: "clients", count: "clients", href: "/admin/clients" },
  { key: "locations", count: "locations", href: "/admin/locations" },
  { key: "cms", count: "content", href: "/admin/cms" },
  { key: "media", count: "media", href: "/admin/media" },
  { key: "inquiries", count: "inquiries", href: "/admin/inquiries" },
  { key: "partnerships", count: "partnerships", href: "/admin/partnerships" },
] as const;

/** The activity log is an entry point too — the dashboard links to the full log. */
const ACTIVITY_ENTRY_POINT: DashboardEntryPoint = { key: "activity", href: "/admin/activity" };

function statusCounts<S extends string>(
  rows: { status: S; _count: { _all: number } }[],
): { total: number; published: number } {
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const published = rows.find((row) => row.status === "published")?._count._all ?? 0;
  return { total, published };
}

function leadCounts<S extends string>(
  rows: { status: S; _count: { _all: number } }[],
): { total: number; new: number } {
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const fresh = rows.find((row) => row.status === "new")?._count._all ?? 0;
  return { total, new: fresh };
}

/**
 * The overview for a signed-in staff member. `role` decides which modules are
 * counted and linked — the permission matrix is the single source of truth.
 */
export async function getDashboardOverview(
  role: Role,
  recentLimit = 10,
): Promise<DashboardOverview> {
  const [
    brandRows,
    productRows,
    categoryRows,
    supplierRows,
    clientRows,
    locationRows,
    inquiryRows,
    partnershipRows,
    contentTotal,
    contentPublished,
    mediaTotal,
    mediaArchived,
  ] = await Promise.all([
    prisma.brand.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.supplier.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.client.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.location.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.partnershipRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.cmsSection.count(),
    prisma.cmsSection.count({ where: { publishedAt: { not: null } } }),
    prisma.media.count(),
    prisma.media.count({ where: { archivedAt: { not: null } } }),
  ]);

  const allCounts: DashboardCounts = {
    brands: statusCounts(brandRows),
    products: statusCounts(productRows),
    categories: statusCounts(categoryRows),
    suppliers: statusCounts(supplierRows),
    clients: statusCounts(clientRows),
    locations: statusCounts(locationRows),
    content: { total: contentTotal, published: contentPublished },
    media: { total: mediaTotal, archived: mediaArchived },
    inquiries: leadCounts(inquiryRows),
    partnerships: leadCounts(partnershipRows),
  };

  const counts: Partial<DashboardCounts> = {};
  const entryPoints: DashboardEntryPoint[] = [];

  for (const entry of MODULES) {
    if (!hasPermission(role, `${entry.key}:read`)) {
      continue;
    }
    Object.assign(counts, { [entry.count]: allCounts[entry.count] });
    entryPoints.push({ key: entry.key, href: entry.href });
  }

  if (hasPermission(role, "activity:read")) {
    entryPoints.push(ACTIVITY_ENTRY_POINT);
  }

  // The log is restricted to the roles that hold `activity:read` — a role
  // without it gets no recent activity at all (FR-022).
  const recentActivity = hasPermission(role, "activity:read")
    ? await listRecentActivity(recentLimit)
    : [];

  return { counts, entryPoints, recentActivity, generatedAt: new Date().toISOString() };
}
