/**
 * T047 [US3] — shared fixtures for the admin auth/RBAC E2E spec.
 *
 * Four accounts (one per documented role, FR-021) are created idempotently in
 * the dev database by `tests/e2e/global-setup.ts` before the suite runs. The
 * dedicated domain keeps these clearly test-only and never collides with the
 * approved seed's bootstrap admin.
 */

export const E2E_PASSWORD = "E2e-Test-Password-123!";

export const E2E_TEST_DOMAIN = "us3-e2e.test";

export const E2E_USERS = {
  superAdmin: {
    email: `superadmin@${E2E_TEST_DOMAIN}`,
    name: "E2E Super Admin",
    role: "SuperAdmin",
  },
  contentManager: {
    email: `contentmanager@${E2E_TEST_DOMAIN}`,
    name: "E2E Content Manager",
    role: "ContentManager",
  },
  productManager: {
    email: `productmanager@${E2E_TEST_DOMAIN}`,
    name: "E2E Product Manager",
    role: "ProductManager",
  },
  salesBusiness: {
    email: `salesbusiness@${E2E_TEST_DOMAIN}`,
    name: "E2E Sales Business",
    role: "SalesBusiness",
  },
} as const;

export type E2ERole = keyof typeof E2E_USERS;
