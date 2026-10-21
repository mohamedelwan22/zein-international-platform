import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "@node-rs/argon2";

/**
 * T106 — activity log + dashboard overview integration (US11, FR-023/FR-035,
 * SC-012, contracts/admin-api.md §2/§10/§11, data-model.md §2.15).
 *
 * Against a real database (ephemeral Postgres, migrations applied) with the
 * session mocked, this exercises the audit surface end to end:
 *
 * - every sensitive administrative action lands in `ActivityLog` with actor,
 *   action, target and timestamp (SC-012, admin-api.md §11): sign-in,
 *   create, update, delete/archive, publish/unpublish, visibility change,
 *   permission change, user change, settings update, status change and
 *   sensitive attachment access;
 * - the log is append-only — the admin surface exposes a read endpoint only,
 *   and no write/update/delete path exists;
 * - `GET /api/admin/activity` filters by actor/action/entityType/date range
 *   and paginates, and it is refused for roles without `activity:read`;
 * - `GET /api/admin/dashboard/overview` returns the module counts, the
 *   entry-point list and the recent activity for every role that holds
 *   `dashboard:read`.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import { authenticateWithCredentials } from "@/server/auth/credentials";
import { recordSignOutEvent } from "@/server/auth/audit-events";
import type { MediaStorage } from "@/server/storage/types";

import { GET as listActivity } from "@/app/api/admin/activity/route";
import { GET as dashboardOverview } from "@/app/api/admin/dashboard/overview/route";
import { POST as createCategory } from "@/app/api/admin/categories/route";
import { POST as createBrand } from "@/app/api/admin/brands/route";
import { PUT as updateBrand, DELETE as deleteBrand } from "@/app/api/admin/brands/[id]/route";
import { POST as brandAction } from "@/app/api/admin/brands/[id]/[action]/route";
import { POST as createUser } from "@/app/api/admin/users/route";
import { PUT as updateUser } from "@/app/api/admin/users/[id]/route";
import { PUT as updateSetting } from "@/app/api/admin/settings/[key]/route";
import { POST as submitInquiry } from "@/app/api/inquiries/route";
import { POST as changeInquiryStatus } from "@/app/api/admin/inquiries/[id]/status/route";
import { POST as submitPartnership } from "@/app/api/partnerships/route";
import { GET as downloadAttachment } from "@/app/api/admin/partnerships/[id]/attachment/route";

const TEST_DOMAIN = "@us11-it.test";
const PASSWORD = "Us11-Test-Password-123!";

// In-memory stand-in for the S3 driver (MinIO is not assumed to run in CI).
const storage = new Map<string, Uint8Array>();
const mediaStorage: MediaStorage = {
  async put({ key, body }) {
    const copy = new Uint8Array(body);
    storage.set(key, copy);
    return { key, byteSize: copy.byteLength, contentType: "application/pdf" };
  },
  async get(key) {
    const body = storage.get(key);
    if (!body) throw new Error(`missing object ${key}`);
    return { body, byteSize: body.byteLength };
  },
  async delete(key) {
    storage.delete(key);
  },
};

type TestUser = { id: string; tokenVersion: number; email: string; role: Role };

function authAs(user: TestUser | null) {
  if (!user) {
    authMock.mockResolvedValue(null);
    return;
  }
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

async function createStaff(role: Role = "SuperAdmin"): Promise<TestUser> {
  return prisma.user.create({
    data: {
      email: `staff-${randomUUID()}${TEST_DOMAIN}`,
      name: "US11 Test Staff",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion: 1,
    },
    select: { id: true, tokenVersion: true, email: true, role: true },
  });
}

function jsonRequest(url: string, method: string, body: unknown): Request {
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

function getRequest(url: string): Request {
  return new Request(`http://localhost${url}`);
}

/** Every TypeScript source file under a workspace-relative directory. */
async function sourceFiles(root: string): Promise<{ path: string; content: string }[]> {
  const collected: { path: string; content: string }[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        collected.push({ path: relative(process.cwd(), full), content: await readFile(full, "utf8") });
      }
    }
  };
  await walk(join(process.cwd(), root));
  return collected;
}

async function resetDatabase() {
  await prisma.activityLog.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.brandCategory.deleteMany({});
  await prisma.supplierCategory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.inquiry.deleteMany({});
  await prisma.partnershipRequest.deleteMany({});
  await prisma.media.deleteMany({});
  await prisma.settings.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
}

beforeEach(async () => {
  authMock.mockReset();
  revalidateTagMock.mockReset();
  storage.clear();
  (globalThis as unknown as { zeinMediaStorage?: MediaStorage }).zeinMediaStorage = mediaStorage;
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
});

/** Create a category + brand pair through the real admin routes. */
async function seedBrand(
  actor: TestUser,
): Promise<{
  id: string;
  version: number;
  categoryId: string;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
}> {
  authAs(actor);
  const categoryRes = await createCategory(
    jsonRequest("/api/admin/categories", "POST", {
      kind: "brand",
      nameEn: "US11 Category",
      nameAr: "فئة US11",
      slugEn: `us11-cat-${randomUUID()}`,
      slugAr: `فئة-${randomUUID()}`,
    }),
  );
  expect(categoryRes.status).toBe(201);
  const category = (await categoryRes.json()) as { id: string };

  authAs(actor);
  const brandRes = await createBrand(
    jsonRequest("/api/admin/brands", "POST", {
      nameEn: "US11 Brand",
      nameAr: "علامة US11",
      slugEn: `us11-brand-${randomUUID()}`,
      slugAr: `علامة-${randomUUID()}`,
      categoryIds: [category.id],
    }),
  );
  expect(brandRes.status).toBe(201);
  const brand = (await brandRes.json()) as {
    id: string;
    version: number;
    nameEn: string;
    nameAr: string;
    slugEn: string;
    slugAr: string;
  };
  return { ...brand, categoryId: category.id };
}

describe("SC-012 — every sensitive action is on the record", () => {
  it("records create, update, publish, unpublish, visibility, archive and delete with actor/action/target/timestamp", async () => {
    const admin = await createStaff("SuperAdmin");
    const brand = await seedBrand(admin);

    authAs(admin);
    const updated = await updateBrand(
      jsonRequest(`/api/admin/brands/${brand.id}`, "PUT", {
        nameEn: brand.nameEn,
        nameAr: brand.nameAr,
        slugEn: brand.slugEn,
        slugAr: brand.slugAr,
        categoryIds: [brand.categoryId],
        summaryEn: "Updated by the US11 audit test",
        version: brand.version,
      }),
      params(brand.id),
    );
    expect(updated.status).toBe(200);

    authAs(admin);
    const published = await brandAction(
      jsonRequest(`/api/admin/brands/${brand.id}/publish`, "POST", {}),
      actionParams(brand.id, "publish"),
    );
    expect(published.status).toBe(200);

    authAs(admin);
    const unpublished = await brandAction(
      jsonRequest(`/api/admin/brands/${brand.id}/unpublish`, "POST", {}),
      actionParams(brand.id, "unpublish"),
    );
    expect(unpublished.status).toBe(200);

    authAs(admin);
    const visibility = await brandAction(
      jsonRequest(`/api/admin/brands/${brand.id}/visibility`, "POST", { isActive: false }),
      actionParams(brand.id, "visibility"),
    );
    expect(visibility.status).toBe(200);

    authAs(admin);
    const archived = await brandAction(
      jsonRequest(`/api/admin/brands/${brand.id}/archive`, "POST", {}),
      actionParams(brand.id, "archive"),
    );
    expect(archived.status).toBe(200);

    authAs(admin);
    const deleted = await deleteBrand(
      new Request(`http://localhost/api/admin/brands/${brand.id}`, { method: "DELETE" }),
      params(brand.id),
    );
    expect(deleted.status).toBe(200);

    const logs = await prisma.activityLog.findMany({
      where: { entityType: "brand", entityId: brand.id },
      orderBy: { createdAt: "asc" },
    });

    expect(logs.map((log) => log.action)).toEqual([
      "create",
      "update",
      "publish",
      "unpublish",
      "visibilityChange",
      "archive",
      "delete",
    ]);

    for (const log of logs) {
      expect(log.actorId).toBe(admin.id);
      expect(log.entityId).toBe(brand.id);
      expect(log.createdAt).toBeInstanceOf(Date);
      expect(log.summary).toBeTruthy();
    }
  });

  it("records a successful and a failed sign-in", async () => {
    const email = `signin-${randomUUID()}${TEST_DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "US11 Sign-in Staff",
        passwordHash: await hash(PASSWORD),
        role: "SuperAdmin",
        tokenVersion: 1,
      },
      select: { id: true, tokenVersion: true, email: true, role: true },
    });

    const headers = new Headers({ "x-forwarded-for": "198.51.100.7" });
    const identity = await authenticateWithCredentials({ email, password: PASSWORD }, headers);
    expect(identity?.id).toBe(user.id);

    const success = await prisma.activityLog.findMany({
      where: { actorId: user.id, action: "login" },
    });
    expect(success).toHaveLength(1);
    expect(success[0].entityType).toBe("user");
    expect(success[0].entityId).toBe(user.id);
    expect(success[0].createdAt).toBeInstanceOf(Date);

    // A wrong password is refused but still leaves a record on the account.
    const failure = await authenticateWithCredentials(
      { email, password: "definitely-not-the-password" },
      new Headers({ "x-forwarded-for": "198.51.100.8" }),
    );
    expect(failure).toBeNull();

    const failures = await prisma.activityLog.findMany({
      where: { actorId: user.id, action: "login" },
    });
    expect(failures).toHaveLength(2);
    expect(failures[1].summary).toMatch(/fail/i);
  });

  it("records a sign-out", async () => {
    const admin = await createStaff("SuperAdmin");

    await recordSignOutEvent({ token: { uid: admin.id } });

    const logs = await prisma.activityLog.findMany({
      where: { actorId: admin.id, action: "logout" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityType).toBe("user");
    expect(logs[0].entityId).toBe(admin.id);
  });

  it("records a permission change (role) and a user change (deactivate)", async () => {
    const admin = await createStaff("SuperAdmin");
    const subject = await createStaff("SalesBusiness");

    authAs(admin);
    const roleChange = await updateUser(
      jsonRequest(`/api/admin/users/${subject.id}`, "PUT", {
        role: "ProductManager",
        version: 1,
      }),
      params(subject.id),
    );
    expect(roleChange.status).toBe(200);

    authAs(admin);
    const deactivated = await updateUser(
      jsonRequest(`/api/admin/users/${subject.id}`, "PUT", {
        active: false,
        version: 2,
      }),
      params(subject.id),
    );
    expect(deactivated.status).toBe(200);

    const logs = await prisma.activityLog.findMany({
      where: { actorId: admin.id, entityType: "user", entityId: subject.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((log) => log.action)).toEqual(["roleChange", "userDeactivate"]);
    expect(logs[0].summary).toContain("role:");
  });

  it("records a user creation", async () => {
    const admin = await createStaff("SuperAdmin");

    authAs(admin);
    const created = await createUser(
      jsonRequest("/api/admin/users", "POST", {
        email: `new-${randomUUID()}${TEST_DOMAIN}`,
        name: "New Staff",
        role: "ContentManager",
        password: PASSWORD,
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };

    const logs = await prisma.activityLog.findMany({
      where: { actorId: admin.id, action: "userCreate", entityId: body.id },
    });
    expect(logs).toHaveLength(1);
  });

  it("records a settings update", async () => {
    const admin = await createStaff("SuperAdmin");

    authAs(admin);
    const updated = await updateSetting(
      jsonRequest("/api/admin/settings/contact_info", "PUT", {
        valueEn: {
          country: "Saudi Arabia",
          city: "Riyadh",
          district: "Al Olaya",
          address: "King Fahd Road",
          phones: ["+966 11 000 0000"],
          email: "hello@zain.example",
          website: "https://zain.example",
        },
        valueAr: {
          country: "السعودية",
          city: "الرياض",
          district: "العليا",
          address: "طريق الملك فهد",
          phones: ["+966 11 000 0000"],
          email: "hello@zain.example",
          website: "https://zain.example",
        },
      }),
      { params: Promise.resolve({ key: "contact_info" }) },
    );
    expect(updated.status).toBe(200);

    const logs = await prisma.activityLog.findMany({
      where: { actorId: admin.id, entityType: "settings", entityId: "contact_info" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("settingsUpdate");
  });

  it("records a lead status change", async () => {
    const sales = await createStaff("SalesBusiness");

    authAs(null);
    const inquiryRes = await submitInquiry(
      jsonRequest("/api/inquiries", "POST", {
        type: "general",
        name: "US11 Visitor",
        email: `visitor-${randomUUID()}@example.com`,
        subject: "US11 audit inquiry",
        message: "Please get in touch about the audit trail.",
        consentAccepted: true,
        locale: "en",
      }),
    );
    expect(inquiryRes.status).toBe(201);
    const inquiry = (await inquiryRes.json()) as { id: string };

    authAs(sales);
    const transitioned = await changeInquiryStatus(
      jsonRequest(`/api/admin/inquiries/${inquiry.id}/status`, "POST", {
        status: "contacted",
        version: 1,
      }),
      params(inquiry.id),
    );
    expect(transitioned.status).toBe(200);

    const logs = await prisma.activityLog.findMany({
      where: { actorId: sales.id, entityType: "inquiry", entityId: inquiry.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("statusChange");
  });

  it("records a sensitive attachment access", async () => {
    const sales = await createStaff("SalesBusiness");

    const form = new FormData();
    form.set("name", "US11 Partner");
    form.set("company", "US11 Distribution");
    form.set("email", `partner-${randomUUID()}@example.com`);
    form.set("message", "We would like to distribute your products.");
    form.set("consentAccepted", "true");
    form.set("locale", "en");
    form.set(
      "attachment",
      new Blob([new TextEncoder().encode("%PDF-1.7\nus11\n%%EOF")], { type: "application/pdf" }),
      "us11-deck.pdf",
    );

    authAs(null);
    const created = await submitPartnership(
      new Request("http://localhost/api/partnerships", {
        method: "POST",
        headers: { "x-forwarded-for": "198.51.100.20" },
        body: form,
      }),
    );
    expect(created.status).toBe(201);
    const partnership = (await created.json()) as { id: string };

    authAs(sales);
    const downloaded = await downloadAttachment(
      getRequest(`/api/admin/partnerships/${partnership.id}/attachment`),
      params(partnership.id),
    );
    expect(downloaded.status).toBe(200);

    const logs = await prisma.activityLog.findMany({
      where: {
        actorId: sales.id,
        entityType: "partnership",
        entityId: partnership.id,
        action: "attachmentAccess",
      },
    });
    expect(logs).toHaveLength(1);
  });
});

describe("the log is append-only", () => {
  it("exposes a read endpoint only — no write, update or delete path exists", async () => {
    const routeModule = await import("@/app/api/admin/activity/route");
    expect(Object.keys(routeModule).sort()).toEqual(["GET"]);

    // Nothing in the application may mutate or remove a log row: the only
    // permitted write is `activityLog.create` (data-model.md §2.15). The
    // generated Prisma client is not application code and is skipped.
    const offenders = (await sourceFiles("src"))
      .filter((file) => !file.path.includes(`${sep}generated${sep}`))
      .filter((file) => /activityLog\.(update|updateMany|delete|deleteMany)\s*\(/.test(file.content))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("GET /api/admin/activity (admin-api.md §10)", () => {
  it("refuses unauthenticated and unauthorized callers", async () => {
    authAs(null);
    expect((await listActivity(getRequest("/api/admin/activity"))).status).toBe(401);

    const product = await createStaff("ProductManager");
    authAs(product);
    expect((await listActivity(getRequest("/api/admin/activity"))).status).toBe(403);

    const sales = await createStaff("SalesBusiness");
    authAs(sales);
    expect((await listActivity(getRequest("/api/admin/activity"))).status).toBe(403);

    const content = await createStaff("ContentManager");
    authAs(content);
    expect((await listActivity(getRequest("/api/admin/activity"))).status).toBe(200);

    const admin = await createStaff("SuperAdmin");
    authAs(admin);
    expect((await listActivity(getRequest("/api/admin/activity"))).status).toBe(200);
  });

  it("returns the entries with actor, action, target and timestamp", async () => {
    const admin = await createStaff("SuperAdmin");
    const brand = await seedBrand(admin);

    authAs(admin);
    const res = await listActivity(getRequest("/api/admin/activity?pageSize=50"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        id: string;
        actorId: string;
        actorName: string;
        actorEmail: string;
        action: string;
        entityType: string;
        entityId: string | null;
        createdAt: string;
      }[];
      total: number;
      page: number;
      pageSize: number;
      pages: number;
    };

    const entry = body.items.find((item) => item.entityId === brand.id);
    expect(entry).toBeDefined();
    expect(entry?.actorId).toBe(admin.id);
    expect(entry?.actorEmail).toBe(admin.email);
    expect(entry?.action).toBe("create");
    expect(entry?.entityType).toBe("brand");
    expect(new Date(entry?.createdAt ?? "").getTime()).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by actor, action, entityType and date range and paginates", async () => {
    const admin = await createStaff("SuperAdmin");
    const brand = await seedBrand(admin);

    authAs(admin);
    const byActor = (await (
      await listActivity(getRequest(`/api/admin/activity?actor=${admin.id}`))
    ).json()) as { items: { actorId: string }[]; total: number };
    expect(byActor.total).toBeGreaterThan(0);
    expect(byActor.items.every((item) => item.actorId === admin.id)).toBe(true);

    authAs(admin);
    const byEmail = (await (
      await listActivity(getRequest(`/api/admin/activity?actor=${encodeURIComponent(admin.email)}`))
    ).json()) as { items: { actorId: string }[]; total: number };
    expect(byEmail.total).toBeGreaterThan(0);
    expect(byEmail.items.every((item) => item.actorId === admin.id)).toBe(true);

    authAs(admin);
    const byAction = (await (
      await listActivity(getRequest("/api/admin/activity?action=create"))
    ).json()) as { items: { action: string }[]; total: number };
    expect(byAction.total).toBeGreaterThan(0);
    expect(byAction.items.every((item) => item.action === "create")).toBe(true);

    authAs(admin);
    const byEntity = (await (
      await listActivity(getRequest("/api/admin/activity?entityType=brand"))
    ).json()) as { items: { entityType: string }[]; total: number };
    expect(byEntity.total).toBeGreaterThan(0);
    expect(byEntity.items.every((item) => item.entityType === "brand")).toBe(true);

    const past = new Date(Date.now() - 60_000).toISOString();
    authAs(admin);
    const byRange = (await (
      await listActivity(
        getRequest(`/api/admin/activity?from=${encodeURIComponent(past)}&to=${encodeURIComponent(new Date().toISOString())}`),
      )
    ).json()) as { items: { entityId: string | null }[]; total: number };
    expect(byRange.total).toBeGreaterThan(0);
    expect(byRange.items.some((item) => item.entityId === brand.id)).toBe(true);

    authAs(admin);
    const paged = (await (
      await listActivity(getRequest("/api/admin/activity?page=1&pageSize=1"))
    ).json()) as { items: unknown[]; total: number; page: number; pageSize: number; pages: number };
    expect(paged.items).toHaveLength(1);
    expect(paged.page).toBe(1);
    expect(paged.pageSize).toBe(1);
    expect(paged.pages).toBe(Math.max(1, Math.ceil(paged.total / paged.pageSize)));
  });
});

describe("GET /api/admin/dashboard/overview (admin-api.md §2)", () => {
  it("refuses unauthenticated callers and allows every role", async () => {
    authAs(null);
    expect((await dashboardOverview()).status).toBe(401);

    for (const role of ["SuperAdmin", "ContentManager", "ProductManager", "SalesBusiness"] as Role[]) {
      const staff = await createStaff(role);
      authAs(staff);
      expect((await dashboardOverview()).status).toBe(200);
    }
  });

  it("returns the module counts, the entry points and the recent activity", async () => {
    const admin = await createStaff("SuperAdmin");
    await seedBrand(admin);

    authAs(admin);
    const res = await dashboardOverview();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      counts: Record<string, { total: number; published?: number; new?: number; archived?: number }>;
      entryPoints: { key: string; href: string }[];
      recentActivity: { id: string; action: string; actorId: string; createdAt: string }[];
      generatedAt: string;
    };

    expect(body.counts.brands.total).toBe(1);
    expect(body.counts.brands.published).toBe(0);
    expect(body.counts.categories.total).toBe(1);
    expect(body.counts.products.total).toBe(0);
    expect(body.counts.suppliers.total).toBe(0);
    expect(body.counts.clients.total).toBe(0);
    expect(body.counts.locations.total).toBe(0);
    expect(body.counts.inquiries.total).toBe(0);
    expect(body.counts.partnerships.total).toBe(0);
    expect(body.counts.content.total).toBe(0);
    expect(body.counts.media.total).toBe(0);

    expect(body.entryPoints.length).toBeGreaterThan(0);
    expect(body.entryPoints.map((entry) => entry.key)).toContain("brands");
    expect(body.entryPoints.map((entry) => entry.href)).toContain("/admin/brands");

    expect(body.recentActivity.length).toBeGreaterThan(0);
    expect(body.recentActivity[0].actorId).toBe(admin.id);
    expect(body.recentActivity[0].action).toBe("create");
    expect(new Date(body.generatedAt).getTime()).toBeGreaterThan(0);
  });
});
