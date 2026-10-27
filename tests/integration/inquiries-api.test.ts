import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T054 [US4] — inquiry intake + admin pipeline integration test
 * (FR-016/FR-017/FR-019, SC-012, contracts/public-api.md, admin-api.md §4).
 *
 * Against a real database (ephemeral Postgres, migrations applied):
 * - `POST /api/inquiries` validates (double validation), persists an anonymous
 *   lead at `new`, stamps consent server-side, never accepts a client consent
 *   `false`, and returns `201 { id, status, createdAt }`;
 * - context FKs are attached ONLY for currently published + active entities
 *   (no publication oracle for stale/unpublished ids);
 * - the IP+email fixed-window limiter returns `429` + `Retry-After`;
 * - `inquiries:read` gates the staff queue (401 / 403 / 200);
 * - status transitions are optimistic-locked, reject illegal moves, and write
 *   exactly one `ActivityLog` row; notes are staff-only and also audited.
 *
 * `auth()` is mocked (no HTTP session context); authorization + the services
 * run for real against the DB.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import { POST as submitInquiry } from "@/app/api/inquiries/route";
import { GET as listLeads } from "@/app/api/admin/inquiries/route";
import {
  GET as getLead,
  PUT as updateLeadNotes,
  DELETE as deleteLead,
} from "@/app/api/admin/inquiries/[id]/route";
import { POST as changeLeadStatus } from "@/app/api/admin/inquiries/[id]/status/route";

const TEST_DOMAIN = "@inquiry-it.test";
const IP = "203.0.113.42";

async function createUser(role: Role = "SalesBusiness", tokenVersion = 1) {
  return prisma.user.create({
    data: {
      email: `inquiry-${randomUUID()}${TEST_DOMAIN}`,
      name: "Inquiry Test Staff",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion,
    },
  });
}

function authAs(user: { id: string; tokenVersion: number }) {
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "general",
    name: "Layla Alharbi",
    email: `visitor-${randomUUID()}@example.com`,
    subject: "Distribution in KSA",
    message: "Could we distribute your products in the western region?",
    consentAccepted: true,
    locale: "en",
    ...overrides,
  };
}

function postRequest(payload: unknown, ip = IP): Request {
  return new Request("http://localhost/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(payload),
  });
}

async function createProduct(status: "draft" | "published", ownerId: string) {
  const brand = await prisma.brand.create({
    data: {
      nameEn: "Test Brand",
      nameAr: "علامة اختبار",
      slugEn: `brand-${randomUUID()}`,
      slugAr: `brand-ar-${randomUUID()}`,
      status,
      createdById: ownerId,
    },
  });
  const product = await prisma.product.create({
    data: {
      nameEn: "Test Product",
      nameAr: "منتج اختبار",
      slugEn: `product-${randomUUID()}`,
      slugAr: `product-ar-${randomUUID()}`,
      status,
      brandId: brand.id,
      createdById: ownerId,
    },
  });
  return { brand, product };
}

beforeEach(async () => {
  authMock.mockReset();
  await prisma.inquiry.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.rateLimitCounter.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
});

describe("POST /api/inquiries (public intake, FR-016)", () => {
  it("persists an anonymous lead at `new` and returns 201 with id/status/createdAt", async () => {
    const payload = validPayload();

    const res = await submitInquiry(postRequest(payload));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ status: "new" });
    expect(typeof body.id).toBe("string");
    expect(body.createdAt).toBeTruthy();

    const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.name).toBe("Layla Alharbi");
    expect(row.email).toBe(payload.email);
    expect(row.consentAccepted).toBe(true);
    expect(row.consentAt).toBeInstanceOf(Date);
    expect(row.status).toBe("new");
    // Raw IP is never stored — only a keyed hash.
    expect(row.createdIpHash).toBeTruthy();
    expect(row.createdIpHash).not.toBe(IP);
  });

  it("rejects missing required fields and consent=false with 400 + validation details", async () => {
    const res = await submitInquiry(
      postRequest(validPayload({ email: "", consentAccepted: false })),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    const issues = (body.error.details as { path: string; issue: string }[]).map((d) => d.issue);
    expect(issues).toContain("required");
    expect(issues).toContain("consentRequired");
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it("silently drops an unpublished context id (never a publication oracle)", async () => {
    const owner = await createUser("ProductManager");
    const { product } = await createProduct("draft", owner.id);

    const res = await submitInquiry(
      postRequest(validPayload({ type: "product", productId: product.id })),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.productId).toBeNull();
  });

  it("attaches a context id that is currently published + active", async () => {
    const owner = await createUser("ProductManager");
    const { product } = await createProduct("published", owner.id);

    const res = await submitInquiry(
      postRequest(validPayload({ type: "product", productId: product.id })),
    );
    const body = await res.json();

    const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.productId).toBe(product.id);
  });

  it("throttles submissions to 5 / 10 min per IP+email with a 429 + Retry-After (FR-019)", async () => {
    const email = `burst-${randomUUID()}@example.com`;

    for (let i = 0; i < 5; i += 1) {
      const res = await submitInquiry(postRequest(validPayload({ email })));
      expect(res.status).toBe(201);
    }

    const blocked = await submitInquiry(postRequest(validPayload({ email })));
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await prisma.inquiry.count({ where: { email } })).toBe(5);
  });
});

describe("admin queue authorization (admin-api.md §4)", () => {
  function listRequest(query = ""): Request {
    return new Request(`http://localhost/api/admin/inquiries${query}`);
  }

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await listLeads(listRequest());
    expect(res.status).toBe(401);
  });

  it("forbids a role without inquiries:read (403)", async () => {
    const manager = await createUser("ContentManager");
    authAs(manager);

    const res = await listLeads(listRequest());
    expect(res.status).toBe(403);
  });

  it("lists leads for Sales/Business, newest first, filtered by status", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    await submitInquiry(postRequest(validPayload({ subject: "First" })));
    const second = await submitInquiry(postRequest(validPayload({ subject: "Second" })));
    const secondBody = await second.json();
    await prisma.inquiry.update({ where: { id: secondBody.id }, data: { status: "contacted" } });

    const all = await listLeads(listRequest());
    const allBody = await all.json();
    expect(all.status).toBe(200);
    expect(allBody.total).toBe(2);

    const onlyNew = await listLeads(listRequest("?status=new"));
    const onlyNewBody = await onlyNew.json();
    expect(onlyNewBody.total).toBe(1);
    expect(onlyNewBody.items[0].subject).toBe("First");
  });
});

describe("lead detail, status pipeline + notes (SC-012)", () => {
  it("404s for an unknown id and returns detail for a known one", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);

    const missing = await getLead(new Request("http://localhost/api/admin/inquiries/nope"), {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(missing.status).toBe(404);

    const created = await submitInquiry(postRequest(validPayload()));
    const { id } = await created.json();

    const detail = await getLead(new Request(`http://localhost/api/admin/inquiries/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(detail.status).toBe(200);
    expect((await detail.json()).id).toBe(id);
  });

  it("moves new → contacted, bumps the version, and writes one ActivityLog row", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitInquiry(postRequest(validPayload()));
    const { id } = await created.json();

    const res = await changeLeadStatus(
      new Request(`http://localhost/api/admin/inquiries/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "contacted", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("contacted");
    expect(body.version).toBe(2);

    const logs = await prisma.activityLog.findMany({
      where: { entityType: "inquiry", entityId: id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "statusChange", actorId: sales.id });
  });

  it("rejects an illegal transition with 400 and a stale version with 409", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitInquiry(postRequest(validPayload()));
    const { id } = await created.json();

    // new → inProgress is allowed; new → back to new is not.
    const illegal = await changeLeadStatus(
      new Request(`http://localhost/api/admin/inquiries/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "new", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(illegal.status).toBe(400);

    const stale = await changeLeadStatus(
      new Request(`http://localhost/api/admin/inquiries/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "closed", version: 99 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(stale.status).toBe(409);
    expect(await prisma.activityLog.count({ where: { entityId: id } })).toBe(0);
  });

  it("saves internal notes and audits the update", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitInquiry(postRequest(validPayload()));
    const { id } = await created.json();

    const res = await updateLeadNotes(
      new Request(`http://localhost/api/admin/inquiries/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "Called on Tuesday — interested.", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notes).toBe("Called on Tuesday — interested.");
    expect(body.version).toBe(2);

    const logs = await prisma.activityLog.findMany({ where: { entityId: id } });
    expect(logs.some((log) => log.action === "update")).toBe(true);
  });

  it("refuses to delete an inquiry when not closed, deletes when closed, and logs deletion", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitInquiry(postRequest(validPayload()));
    const { id } = await created.json();

    // Still 'new' -> 400 badRequest
    const refused = await deleteLead(
      new Request(`http://localhost/api/admin/inquiries/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(refused.status).toBe(400);

    // Transition to closed
    await changeLeadStatus(
      new Request(`http://localhost/api/admin/inquiries/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "closed", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );

    // Now delete succeeds
    const deleted = await deleteLead(
      new Request(`http://localhost/api/admin/inquiries/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id, deleted: true });

    // Verifying row is gone from DB
    expect(await prisma.inquiry.findUnique({ where: { id } })).toBeNull();

    // Verifying ActivityLog has "delete"
    const deleteLogs = await prisma.activityLog.findMany({
      where: { entityType: "inquiry", entityId: id, action: "delete" },
    });
    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0].actorId).toBe(sales.id);
  });
});
