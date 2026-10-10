/**
 * Role → `resource:action` permission matrix (FR-021, FR-022, SC-004).
 *
 * SINGLE SOURCE OF TRUTH for authorization, the admin menu, and the exhaustive
 * unit tests (tests/unit/permissions.test.ts).
 *
 * Roles (exactly four — admin-api.md §Roles):
 *   - SuperAdmin (SA)      : everything
 *   - ContentManager (CM)  : cms, media, seo, settings, activity read, catalog read
 *   - ProductManager (PM)  : brands, products, categories, suppliers, locations,
 *                            media upload/read
 *   - SalesBusiness (SB)   : clients, inquiries, partnerships, media upload/read
 *
 * Documented matrix decisions (per T017, where the contract left the call to
 * this file):
 *   1. `suppliers` → ProductManager (catalog/directory corpus owner, matrix
 *      intent "brands, products, categories, suppliers").
 *   2. `locations` → ProductManager full lifecycle (directory entity, US7
 *      module owner); ContentManager keeps locations:read via catalog read.
 *   3. `activity:read` → SuperAdmin + ContentManager (data-model.md §2.15:
 *      "Super Admin default; Content Manager per matrix review in tasks").
 *   4. `users:*` → SuperAdmin only (US12).
 *   5. `media` full CRUD → SuperAdmin + ContentManager (matrix intent
 *      "media"); ProductManager/SalesBusiness get read+upload only (matrix
 *      intent "media upload") — the US12 MediaPicker needs media:read.
 *   6. `dashboard:read` → all roles (admin-api.md §2).
 */

export const ROLES = ["SuperAdmin", "ContentManager", "ProductManager", "SalesBusiness"] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  "dashboard",
  "brands",
  "products",
  "categories",
  "suppliers",
  "clients",
  "locations",
  "cms",
  "media",
  "seo",
  "inquiries",
  "partnerships",
  "users",
  "settings",
  "activity",
] as const;
export type Resource = (typeof RESOURCES)[number];

/** Actions available per resource (admin-api.md §2–§10). */
export const RESOURCE_ACTIONS = {
  dashboard: ["read"],
  brands: ["read", "create", "update", "delete", "publish", "archive", "visibility"],
  products: ["read", "create", "update", "delete", "publish", "archive", "visibility"],
  categories: ["read", "create", "update", "delete", "publish", "archive", "visibility"],
  suppliers: ["read", "create", "update", "delete", "publish", "archive", "visibility"],
  clients: ["read", "create", "update", "delete", "publish", "archive", "visibility"],
  locations: ["read", "create", "update", "delete", "publish", "archive", "visibility"],
  cms: ["read", "update", "publish"],
  media: ["read", "upload", "update", "archive", "delete"],
  seo: ["read", "update"],
  inquiries: ["read", "update", "statusChange", "delete"],
  partnerships: ["read", "update", "statusChange", "delete"],
  users: ["read", "create", "update"],
  settings: ["read", "update"],
  activity: ["read"],
} as const satisfies Record<Resource, readonly string[]>;

type Correlated = {
  [R in Resource]: `${R}:${(typeof RESOURCE_ACTIONS)[R][number]}`;
};
export type Permission = Correlated[Resource];

export const ALL_PERMISSIONS = Object.entries(RESOURCE_ACTIONS).flatMap(([resource, actions]) =>
  (actions as readonly string[]).map((action) => `${resource}:${action}` as Permission),
);

const catalogRead: readonly Permission[] = [
  "brands:read",
  "products:read",
  "categories:read",
  "suppliers:read",
  "clients:read",
  "locations:read",
];

const mediaFull: readonly Permission[] = [
  "media:read",
  "media:upload",
  "media:update",
  "media:archive",
  "media:delete",
];

const entityFull = (resource: Resource): readonly Permission[] =>
  (RESOURCE_ACTIONS[resource] as readonly string[]).map(
    (action) => `${resource}:${action}` as Permission,
  );

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SuperAdmin: ALL_PERMISSIONS,
  ContentManager: [
    "dashboard:read",
    "cms:read",
    "cms:update",
    "cms:publish",
    ...mediaFull,
    "seo:read",
    "seo:update",
    "settings:read",
    "settings:update",
    "activity:read",
    ...catalogRead,
  ],
  ProductManager: [
    "dashboard:read",
    ...entityFull("brands"),
    ...entityFull("products"),
    ...entityFull("categories"),
    ...entityFull("suppliers"),
    ...entityFull("locations"),
    "media:read",
    "media:upload",
  ],
  SalesBusiness: [
    "dashboard:read",
    ...entityFull("clients"),
    ...entityFull("inquiries"),
    ...entityFull("partnerships"),
    "media:read",
    "media:upload",
  ],
};

const permissionSets: Record<Role, Set<string>> = {
  SuperAdmin: new Set(ROLE_PERMISSIONS.SuperAdmin),
  ContentManager: new Set(ROLE_PERMISSIONS.ContentManager),
  ProductManager: new Set(ROLE_PERMISSIONS.ProductManager),
  SalesBusiness: new Set(ROLE_PERMISSIONS.SalesBusiness),
};

/** Server-side permission check (FR-022) — hiding UI is never enforcement. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionSets[role].has(permission);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
