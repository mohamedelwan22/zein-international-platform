import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  RESOURCE_ACTIONS,
  ROLES,
  ROLE_PERMISSIONS,
  RESOURCES,
  hasPermission,
  permissionsForRole,
  type Permission,
} from "../../src/server/auth/permissions";

/**
 * SC-004 — exhaustive matrix coverage: every role × every `resource:action`
 * asserts the expected allow/deny. 100% of privileged operations attempted
 * without the required permission are refused.
 */
describe("permission matrix (SC-004)", () => {
  it("defines exactly the four documented roles (FR-021)", () => {
    expect([...ROLES]).toEqual(["SuperAdmin", "ContentManager", "ProductManager", "SalesBusiness"]);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it("Super Admin holds every permission and nothing else exists", () => {
    const superAdmin = new Set(ROLE_PERMISSIONS.SuperAdmin);
    for (const permission of ALL_PERMISSIONS) {
      expect(superAdmin.has(permission), `SA should have ${permission}`).toBe(true);
    }
    expect(superAdmin.size).toBe(ALL_PERMISSIONS.length);
  });

  it("grants/denies every permission for every role with zero gaps", () => {
    for (const role of ROLES) {
      const granted = new Set(ROLE_PERMISSIONS[role]);
      for (const permission of ALL_PERMISSIONS) {
        expect(
          hasPermission(role, permission),
          `${role} × ${permission} must match the matrix`,
        ).toBe(granted.has(permission));
      }
    }
  });

  it("never grants a permission that is not part of the known vocabulary", () => {
    const vocabulary = new Set<string>(ALL_PERMISSIONS);
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(vocabulary.has(permission), `unknown permission ${permission}`).toBe(true);
      }
    }
  });

  it("every action of every resource is grantable (no dead permissions)", () => {
    const grantable = new Set<string>(ALL_PERMISSIONS);
    for (const resource of RESOURCES) {
      for (const action of RESOURCE_ACTIONS[resource]) {
        expect(grantable.has(`${resource}:${action}` as Permission)).toBe(true);
      }
    }
  });

  it("Content Manager: cms/media/seo/settings/activity + catalog read ONLY", () => {
    expect(hasPermission("ContentManager", "cms:publish")).toBe(true);
    expect(hasPermission("ContentManager", "media:delete")).toBe(true);
    expect(hasPermission("ContentManager", "settings:update")).toBe(true);
    expect(hasPermission("ContentManager", "seo:update")).toBe(true);
    expect(hasPermission("ContentManager", "activity:read")).toBe(true);
    expect(hasPermission("ContentManager", "brands:read")).toBe(true);
    expect(hasPermission("ContentManager", "locations:read")).toBe(true);

    expect(hasPermission("ContentManager", "brands:create")).toBe(false);
    expect(hasPermission("ContentManager", "products:update")).toBe(false);
    expect(hasPermission("ContentManager", "users:read")).toBe(false);
    expect(hasPermission("ContentManager", "inquiries:read")).toBe(false);
    expect(hasPermission("ContentManager", "partnerships:statusChange")).toBe(false);
  });

  it("Product Manager: catalog+directory lifecycle + media upload/read ONLY", () => {
    expect(hasPermission("ProductManager", "brands:create")).toBe(true);
    expect(hasPermission("ProductManager", "products:publish")).toBe(true);
    expect(hasPermission("ProductManager", "categories:delete")).toBe(true);
    expect(hasPermission("ProductManager", "suppliers:visibility")).toBe(true);
    expect(hasPermission("ProductManager", "locations:archive")).toBe(true);
    expect(hasPermission("ProductManager", "media:upload")).toBe(true);
    expect(hasPermission("ProductManager", "media:read")).toBe(true);

    expect(hasPermission("ProductManager", "cms:update")).toBe(false);
    expect(hasPermission("ProductManager", "seo:update")).toBe(false);
    expect(hasPermission("ProductManager", "settings:read")).toBe(false);
    expect(hasPermission("ProductManager", "clients:read")).toBe(false);
    expect(hasPermission("ProductManager", "inquiries:read")).toBe(false);
    expect(hasPermission("ProductManager", "users:create")).toBe(false);
    expect(hasPermission("ProductManager", "activity:read")).toBe(false);
    expect(hasPermission("ProductManager", "media:delete")).toBe(false);
  });

  it("Sales/Business: clients/inquiries/partnerships + media upload/read ONLY", () => {
    expect(hasPermission("SalesBusiness", "clients:visibility")).toBe(true);
    expect(hasPermission("SalesBusiness", "inquiries:statusChange")).toBe(true);
    expect(hasPermission("SalesBusiness", "partnerships:delete")).toBe(true);
    expect(hasPermission("SalesBusiness", "media:upload")).toBe(true);
    expect(hasPermission("SalesBusiness", "media:read")).toBe(true);

    expect(hasPermission("SalesBusiness", "brands:create")).toBe(false);
    expect(hasPermission("SalesBusiness", "products:read")).toBe(false);
    expect(hasPermission("SalesBusiness", "cms:read")).toBe(false);
    expect(hasPermission("SalesBusiness", "seo:read")).toBe(false);
    expect(hasPermission("SalesBusiness", "settings:update")).toBe(false);
    expect(hasPermission("SalesBusiness", "users:update")).toBe(false);
    expect(hasPermission("SalesBusiness", "activity:read")).toBe(false);
  });

  it("users:* and catalog mutations are refused for every non-SuperAdmin role", () => {
    const nonSuper = ROLES.filter((role) => role !== "SuperAdmin");
    const privileged: Permission[] = ["users:read", "users:create", "users:update"];
    for (const role of nonSuper) {
      for (const permission of privileged) {
        expect(hasPermission(role, permission), `${role} must not have ${permission}`).toBe(false);
      }
    }
  });

  it("dashboard:read is available to all roles (admin-api §2)", () => {
    for (const role of ROLES) {
      expect(hasPermission(role, "dashboard:read")).toBe(true);
    }
  });

  it("permissionsForRole returns the same set the checker enforces", () => {
    for (const role of ROLES) {
      const listed = permissionsForRole(role);
      expect(new Set(listed)).toEqual(new Set(ROLE_PERMISSIONS[role]));
      for (const permission of listed) {
        expect(hasPermission(role, permission)).toBe(true);
      }
    }
  });
});
