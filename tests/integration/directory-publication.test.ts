import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * US8 — supplier & client public-directory publication (integration).
 *
 * Covers the end-to-end contract the manual QA pass exercised:
 *
 *   Admin UI -> POST /api/admin/{resource} -> POST .../publish
 *     -> PUT .../{id} (disclosure) -> DB -> public predicate
 *     -> `server/services/directory.ts` -> cache tags -> public page data.
 *
 * Locks in the data-model rules that make Publish and public disclosure TWO
 * separate operations for these two resources:
 *   - §2.5 supplier: public ONLY when `disclosureApproved AND status=
 *     'published' AND isActive`;
 *   - §2.6 client: confidential BY DEFAULT, same three-part predicate, with
 *     only the approved public fields ever selected (never audit/status).
 *
 * Also asserts the cache tag contract, so a newly eligible record becomes
 * visible through the normal read path (no server restart required) and
 * private fields never cross into the public shapes.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import {
  listPublicClients,
  listPublicSuppliers,
  publicSupplierDetail,
} from "@/server/services/directory";

import * as categories from "@/app/api/admin/categories/route";
import * as categoryAction from "@/app/api/admin/categories/[id]/[action]/route";
import * as suppliers from "@/app/api/admin/suppliers/route";
import * as supplierItem from "@/app/api/admin/suppliers/[id]/route";
import * as supplierAction from "@/app/api/admin/suppliers/[id]/[action]/route";
import * as clients from "@/app/api/admin/clients/route";
import * as clientItem from "@/app/api/admin/clients/[id]/route";
import * as clientAction from "@/app/api/admin/clients/[id]/[action]/route";

const TEST_DOMAIN = "@us8-it.test";

type TestUser = { id: string; tokenVersion: number };
type Detail = { id: string; version: number } & Record<string, unknown>;

function authAs(user: TestUser | null) {
  if (!user) {
    authMock.mockResolvedValue(null);
    return;
  }
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

async function createStaff(role: Role): Promise<TestUser> {
  return prisma.user.create({
    data: {
      email: `staff-${randomUUID()}${TEST_DOMAIN}`,
      name: "US8 Test Staff",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion: 1,
    },
    select: { id: true, tokenVersion: true },
  });
}

function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function actionParams(id: string, action: string) {
  return { params: Promise.resolve({ id, action }) };
}

async function createSupplierCategory(actor: TestUser): Promise<string> {
  authAs(actor);
  const res = await categories.POST(
    jsonReq("/api/admin/categories", "POST", {
      kind: "supplier",
      nameEn: "Directory Category",
      nameAr: "فئة الدليل",
      slugEn: `dir-cat-${randomUUID()}`,
      slugAr: `dir-cat-ar-${randomUUID()}`,
    }),
  );
  expect(res.status).toBe(201);
  const category = (await res.json()) as Detail;

  // Public supplier reads only surface PUBLISHED categories (FR-011), so the
  // fixture has to be published too — otherwise the assertion proves nothing.
  authAs(actor);
  const published = await categoryAction.POST(
    jsonReq(`/api/admin/categories/${category.id}/publish`, "POST", {}),
    actionParams(category.id, "publish"),
  );
  expect(published.status).toBe(200);

  return category.id;
}

function supplierPayload(categoryIds: string[], overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID();
  return {
    nameEn: `Acme Supply ${suffix}`,
    nameAr: `شركة الإمداد ${suffix}`,
    slugEn: `acme-supply-${suffix}`,
    slugAr: `acme-supply-ar-${suffix}`,
    categoryIds,
    ...overrides,
  };
}

function clientPayload(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID();
  return {
    nameEn: `Confidential Co ${suffix}`,
    nameAr: `شركة سرية ${suffix}`,
    industryEn: "Energy",
    ...overrides,
  };
}

async function createSupplier(actor: TestUser, payload: Record<string, unknown>): Promise<Detail> {
  authAs(actor);
  const res = await suppliers.POST(jsonReq("/api/admin/suppliers", "POST", payload));
  expect(res.status).toBe(201);
  return res.json();
}

async function createClient(actor: TestUser, payload: Record<string, unknown>): Promise<Detail> {
  authAs(actor);
  const res = await clients.POST(jsonReq("/api/admin/clients", "POST", payload));
  expect(res.status).toBe(201);
  return res.json();
}

async function publish(
  handler: typeof supplierAction.POST,
  resource: string,
  id: string,
  actor: TestUser,
  version?: number,
) {
  authAs(actor);
  const res = await handler(
    jsonReq(`/api/admin/${resource}/${id}/publish`, "POST", version === undefined ? {} : { version }),
    actionParams(id, "publish"),
  );
  expect(res.status).toBe(200);
  return res.json() as Promise<Detail>;
}

async function putDetail(
  handler: typeof supplierItem.PUT,
  resource: string,
  id: string,
  actor: TestUser,
  body: Record<string, unknown>,
) {
  authAs(actor);
  const res = await handler(jsonReq(`/api/admin/${resource}/${id}/edit`, "PUT", body), params(id));
  expect(res.status).toBe(200);
  return res.json() as Promise<Detail>;
}

const revalidatedTags = () => revalidateTagMock.mock.calls.map((call) => String(call[0]));

async function resetDatabase() {
  await prisma.activityLog.deleteMany({});
  await prisma.supplierCategory.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.media.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
}

beforeEach(async () => {
  authMock.mockReset();
  revalidateTagMock.mockReset();
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
});

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

describe("supplier publication -> public directory (FR-011, data-model §2.5)", () => {
  it("creates a supplier, and Publish alone keeps it off the public directory until disclosure is approved", async () => {
    const pm = await createStaff("ProductManager");
    const categoryId = await createSupplierCategory(pm);

    const created = await createSupplier(pm, supplierPayload([categoryId]));
    expect(created.status).toBe("draft");
    // Confidential by default — the create schema must not silently disclose.
    expect(created.disclosureApproved).toBe(false);
    expect((await listPublicSuppliers("en")).map((s) => s.id)).not.toContain(created.id);

    // Publish persists `status` and nothing else.
    const published = await publish(supplierAction.POST, "suppliers", created.id, pm);
    expect(published.status).toBe("published");
    expect(published.disclosureApproved).toBe(false);
    expect(published.version).toBeGreaterThan(created.version);

    const row = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("published");
    expect(row.isActive).toBe(true);
    expect(row.disclosureApproved).toBe(false);

    // Still hidden: publish is NOT sufficient for these two resources.
    expect((await listPublicSuppliers("en")).map((s) => s.id)).not.toContain(created.id);
    expect(await publicSupplierDetail("en", created.slugEn as string)).toBeNull();

    // Approving disclosure on the now-published record makes it public.
    const approved = await putDetail(supplierItem.PUT, "suppliers", created.id, pm, {
      nameEn: created.nameEn,
      nameAr: created.nameAr,
      slugEn: created.slugEn,
      slugAr: created.slugAr,
      categoryIds: [categoryId],
      disclosureApproved: true,
      version: published.version,
    });
    expect(approved.disclosureApproved).toBe(true);

    const listed = await listPublicSuppliers("en");
    expect(listed.map((s) => s.id)).toContain(created.id);

    const detail = await publicSupplierDetail("en", created.slugEn as string);
    expect(detail?.name).toBe(created.nameEn);
    expect(detail?.categories.map((c) => c.id)).toEqual([categoryId]);
  });

  it("keeps draft, inactive and undisclosed suppliers out of the public reads", async () => {
    const pm = await createStaff("ProductManager");
    const categoryId = await createSupplierCategory(pm);

    // Published + disclosed, but deactivated.
    const inactive = await createSupplier(pm, supplierPayload([categoryId]));
    await publish(supplierAction.POST, "suppliers", inactive.id, pm);
    await putDetail(supplierItem.PUT, "suppliers", inactive.id, pm, {
      nameEn: inactive.nameEn,
      nameAr: inactive.nameAr,
      slugEn: inactive.slugEn,
      slugAr: inactive.slugAr,
      categoryIds: [categoryId],
      disclosureApproved: true,
      isActive: false,
      version: (inactive.version as number) + 1,
    });

    // Published + disclosed + active — the only eligible shape.
    const eligible = await createSupplier(pm, supplierPayload([categoryId]));
    await publish(supplierAction.POST, "suppliers", eligible.id, pm);
    await putDetail(supplierItem.PUT, "suppliers", eligible.id, pm, {
      nameEn: eligible.nameEn,
      nameAr: eligible.nameAr,
      slugEn: eligible.slugEn,
      slugAr: eligible.slugAr,
      categoryIds: [categoryId],
      disclosureApproved: true,
      version: (eligible.version as number) + 1,
    });

    // Unpublish the eligible one — it must disappear again.
    authAs(pm);
    const unpublished = await supplierAction.POST(
      jsonReq(`/api/admin/suppliers/${eligible.id}/unpublish`, "POST", {}),
      actionParams(eligible.id, "unpublish"),
    );
    expect(unpublished.status).toBe(200);

    const en = await listPublicSuppliers("en");
    const ar = await listPublicSuppliers("ar");
    expect(en.map((s) => s.id)).not.toContain(inactive.id);
    expect(en.map((s) => s.id)).not.toContain(eligible.id);
    expect(ar.map((s) => s.id)).not.toContain(eligible.id);
    expect(await publicSupplierDetail("en", eligible.slugEn as string)).toBeNull();
  });

  it("invalidates the supplier cache tags on publish and on a disclosure change, so no restart is needed", async () => {
    const pm = await createStaff("ProductManager");
    const categoryId = await createSupplierCategory(pm);
    const supplier = await createSupplier(pm, supplierPayload([categoryId]));

    revalidateTagMock.mockClear();
    const published = await publish(supplierAction.POST, "suppliers", supplier.id, pm);
    expect(revalidatedTags()).toEqual(expect.arrayContaining(["suppliers:en", "suppliers:ar"]));
    expect(revalidatedTags()).toEqual(
      expect.arrayContaining([
        `supplier:en:${supplier.slugEn as string}`,
        `supplier:ar:${supplier.slugAr as string}`,
      ]),
    );

    revalidateTagMock.mockClear();
    await putDetail(supplierItem.PUT, "suppliers", supplier.id, pm, {
      nameEn: supplier.nameEn,
      nameAr: supplier.nameAr,
      slugEn: supplier.slugEn,
      slugAr: supplier.slugAr,
      categoryIds: [categoryId],
      disclosureApproved: true,
      version: published.version,
    });
    expect(revalidatedTags()).toEqual(expect.arrayContaining(["suppliers:en", "suppliers:ar"]));
  });

  it("never leaks staff-only fields through the public supplier reads", async () => {
    const pm = await createStaff("ProductManager");
    const categoryId = await createSupplierCategory(pm);
    const supplier = await createSupplier(pm, supplierPayload([categoryId]));
    const published = await publish(supplierAction.POST, "suppliers", supplier.id, pm);
    await putDetail(supplierItem.PUT, "suppliers", supplier.id, pm, {
      nameEn: supplier.nameEn,
      nameAr: supplier.nameAr,
      slugEn: supplier.slugEn,
      slugAr: supplier.slugAr,
      categoryIds: [categoryId],
      disclosureApproved: true,
      version: published.version,
    });

    const forbidden = [
      "disclosureApproved",
      "status",
      "isActive",
      "version",
      "createdById",
      "updatedById",
      "createdAt",
      "updatedAt",
    ];

    const [summary] = await listPublicSuppliers("en");
    const detail = await publicSupplierDetail("en", supplier.slugEn as string);
    for (const key of forbidden) {
      expect(summary).not.toHaveProperty(key);
      expect(detail).not.toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

describe("client publication -> public directory (FR-012, data-model §2.6)", () => {
  it("defaults disclosure to false and keeps a published client private until disclosure is approved", async () => {
    const sales = await createStaff("SalesBusiness");
    const created = await createClient(sales, clientPayload());

    // Confidential by default (§2.6).
    expect(created.disclosureApproved).toBe(false);
    expect(created.status).toBe("draft");
    expect((await listPublicClients("en")).map((c) => c.id)).not.toContain(created.id);

    const published = await publish(clientAction.POST, "clients", created.id, sales);
    expect(published.status).toBe("published");
    expect(published.disclosureApproved).toBe(false);

    const row = await prisma.client.findFirstOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("published");
    expect(row.disclosureApproved).toBe(false);

    // Published but undisclosed — must never appear.
    expect((await listPublicClients("en")).map((c) => c.id)).not.toContain(created.id);
    expect((await listPublicClients("ar")).map((c) => c.id)).not.toContain(created.id);

    // Approving disclosure is the second, independent step.
    await putDetail(clientItem.PUT, "clients", created.id, sales, {
      nameEn: created.nameEn,
      nameAr: created.nameAr,
      industryEn: "Energy",
      disclosureApproved: true,
      version: published.version,
    });

    const listed = await listPublicClients("en");
    expect(listed.map((c) => c.id)).toContain(created.id);
    expect(listed.find((c) => c.id === created.id)?.name).toBe(created.nameEn);

    const ar = await listPublicClients("ar");
    expect(ar.find((c) => c.id === created.id)?.name).toBe(created.nameAr);
  });

  it("keeps draft and inactive clients out of the public client directory", async () => {
    const sales = await createStaff("SalesBusiness");

    const draft = await createClient(sales, clientPayload({ disclosureApproved: true }));
    expect(draft.status).toBe("draft");
    expect((await listPublicClients("en")).map((c) => c.id)).not.toContain(draft.id);

    const active = await createClient(sales, clientPayload({ disclosureApproved: true }));
    const published = await publish(clientAction.POST, "clients", active.id, sales);
    expect((await listPublicClients("en")).map((c) => c.id)).toContain(active.id);

    await putDetail(clientItem.PUT, "clients", active.id, sales, {
      nameEn: active.nameEn,
      nameAr: active.nameAr,
      industryEn: "Energy",
      disclosureApproved: true,
      isActive: false,
      version: published.version,
    });
    expect((await listPublicClients("en")).map((c) => c.id)).not.toContain(active.id);
    expect((await listPublicClients("ar")).map((c) => c.id)).not.toContain(active.id);
  });

  it("invalidates the client cache tags on publish and on a disclosure change", async () => {
    const sales = await createStaff("SalesBusiness");
    const client = await createClient(sales, clientPayload());

    revalidateTagMock.mockClear();
    const published = await publish(clientAction.POST, "clients", client.id, sales);
    expect(revalidatedTags()).toEqual(expect.arrayContaining(["clients:en", "clients:ar"]));

    revalidateTagMock.mockClear();
    await putDetail(clientItem.PUT, "clients", client.id, sales, {
      nameEn: client.nameEn,
      nameAr: client.nameAr,
      industryEn: "Energy",
      disclosureApproved: true,
      version: published.version,
    });
    expect(revalidatedTags()).toEqual(expect.arrayContaining(["clients:en", "clients:ar"]));
  });

  it("never exposes confidential client fields through the public client read", async () => {
    const sales = await createStaff("SalesBusiness");
    const client = await createClient(
      sales,
      clientPayload({ disclosureApproved: true, website: "https://confidential.example" }),
    );
    await publish(clientAction.POST, "clients", client.id, sales);

    const [row] = await listPublicClients("en");
    const allowed = [
      "id",
      "name",
      "logoMediaId",
      "industry",
      "location",
      "website",
      "description",
    ];
    expect(Object.keys(row).sort()).toEqual([...allowed].sort());
  });
});
