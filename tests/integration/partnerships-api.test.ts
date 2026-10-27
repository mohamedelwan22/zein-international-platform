import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T061 — Partnership API integration (US5, FR-018/FR-033/FR-035,
 * contracts/public-api.md, admin-api.md §4).
 *
 * Against a real database (ephemeral Postgres, migrations applied) and a fake
 * in-memory `MediaStorage` (MinIO is not assumed to run in CI):
 * - `POST /api/partnerships` persists an anonymous request at `new`, stamps
 *   consent server-side, and returns `201 { id, status, createdAt }`;
 * - a valid PDF attachment is magic-byte validated, stored, and linked through
 *   a `Media` row owned by the non-loginable system user;
 * - a non-document (PNG) is `415`, an oversized document is `413`, malformed
 *   JSON is `400`, and the IP+email window returns `429`;
 * - the staff queue + mutations are gated by `partnerships:*` (401/403/200);
 * - the shared pipeline rejects illegal moves (`400`) and stale versions
 *   (`409`) and writes exactly one `ActivityLog` row;
 * - fetching an attachment streams the bytes and records an `attachmentAccess`
 *   log (FR-035).
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import type { MediaStorage } from "@/server/storage/types";
import { POST as submitPartnership } from "@/app/api/partnerships/route";
import { GET as listPartnerships } from "@/app/api/admin/partnerships/route";
import { PUT as updateNotes, DELETE as deletePartnership } from "@/app/api/admin/partnerships/[id]/route";
import { POST as changeStatus } from "@/app/api/admin/partnerships/[id]/status/route";
import { GET as downloadAttachment } from "@/app/api/admin/partnerships/[id]/attachment/route";

const IP = "203.0.113.42";
const TEST_DOMAIN = "@partnership-it.test";

// In-memory stand-in for the S3 driver, keyed by storage key.
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

type TestUser = { id: string; tokenVersion: number };

async function createUser(role: Role = "SalesBusiness", tokenVersion = 1) {
  return prisma.user.create({
    data: {
      email: `staff-${randomUUID()}${TEST_DOMAIN}`,
      name: "Partnership Test Staff",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion,
    },
  });
}

function authAs(user: TestUser) {
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

function validFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Layla Alharbi",
    company: "Gulf Distribution Co.",
    email: `visitor-${randomUUID()}@example.com`,
    message: "We would like to distribute your products across the Gulf region.",
    consentAccepted: true,
    locale: "en",
    ...overrides,
  };
}

function jsonRequest(fields: Record<string, unknown>, ip = IP): Request {
  return new Request("http://localhost/api/partnerships", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(fields),
  });
}

function multipartRequest(
  fields: Record<string, unknown>,
  attachment?: { bytes: Uint8Array; name: string; type: string },
  ip = IP,
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  if (attachment) {
    const bytes = new Uint8Array(attachment.bytes);
    form.set("attachment", new Blob([bytes], { type: attachment.type }), attachment.name);
  }
  return new Request("http://localhost/api/partnerships", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: form,
  });
}

function pdfBytes(suffix = "document"): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${suffix}\n%%EOF`);
}

beforeEach(async () => {
  authMock.mockReset();
  storage.clear();
  (globalThis as unknown as { zeinMediaStorage?: MediaStorage }).zeinMediaStorage = mediaStorage;

  await prisma.partnershipRequest.deleteMany({});
  await prisma.media.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.rateLimitCounter.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
});

afterAll(() => {
  delete (globalThis as unknown as { zeinMediaStorage?: MediaStorage }).zeinMediaStorage;
});

describe("POST /api/partnerships (public intake, FR-018)", () => {
  it("persists an anonymous request at `new` and returns 201 with id/status/createdAt", async () => {
    const fields = validFields();
    const res = await submitPartnership(jsonRequest(fields));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ status: "new" });
    expect(typeof body.id).toBe("string");
    expect(body.createdAt).toBeTruthy();

    const row = await prisma.partnershipRequest.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.company).toBe(fields.company);
    expect(row.email).toBe(fields.email);
    expect(row.consentAccepted).toBe(true);
    expect(row.consentAt).toBeInstanceOf(Date);
    expect(row.status).toBe("new");
    // Raw IP is never stored — only a keyed hash.
    expect(row.createdIpHash).toBeTruthy();
    expect(row.createdIpHash).not.toBe(IP);
  });

  it("rejects missing required fields and consent=false with 400 + validation details", async () => {
    const res = await submitPartnership(
      jsonRequest(validFields({ email: "", consentAccepted: false })),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    const issues = (body.error.details as { path: string; issue: string }[]).map((d) => d.issue);
    expect(issues).toContain("required");
    expect(issues).toContain("consentRequired");
    expect(await prisma.partnershipRequest.count()).toBe(0);
  });

  it("stores a valid PDF attachment in a Media row owned by the system user", async () => {
    const res = await submitPartnership(
      multipartRequest(validFields(), {
        bytes: pdfBytes("proposal"),
        name: "proposal.pdf",
        type: "application/pdf",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    const row = await prisma.partnershipRequest.findUniqueOrThrow({
      where: { id: body.id },
      include: { attachment: true },
    });
    expect(row.attachment).not.toBeNull();
    expect(row.attachment?.kind).toBe("document");
    expect(row.attachment?.mimeType).toBe("application/pdf");
    expect(row.attachment?.originalName).toBe("proposal.pdf");
    expect(storage.has(row.attachment!.storageKey)).toBe(true);

    const uploader = await prisma.user.findUniqueOrThrow({
      where: { id: row.attachment!.uploadedById },
    });
    expect(uploader.email).toBe("system-uploader@zain.local");
    expect(uploader.active).toBe(false);
  });

  it("rejects a non-document attachment (PNG bytes) with 415", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const res = await submitPartnership(
      multipartRequest(validFields(), { bytes: png, name: "image.png", type: "image/png" }),
    );
    expect(res.status).toBe(415);
    expect(await prisma.partnershipRequest.count()).toBe(0);
  });

  it("rejects an oversized document with 413", async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-1.7"), 0);
    const res = await submitPartnership(
      multipartRequest(validFields(), { bytes: big, name: "huge.pdf", type: "application/pdf" }),
    );
    expect(res.status).toBe(413);
    expect(await prisma.partnershipRequest.count()).toBe(0);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const req = new Request("http://localhost/api/partnerships", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": IP },
      body: "{ not json",
    });
    expect((await submitPartnership(req)).status).toBe(400);
  });

  it("throttles submissions to 5 / 10 min per IP+email with a 429 + Retry-After (FR-019)", async () => {
    const email = `burst-${randomUUID()}@example.com`;
    for (let i = 0; i < 5; i += 1) {
      const res = await submitPartnership(jsonRequest(validFields({ email })));
      expect(res.status).toBe(201);
    }

    const blocked = await submitPartnership(jsonRequest(validFields({ email })));
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await prisma.partnershipRequest.count({ where: { email } })).toBe(5);
  });
});

describe("admin queue authorization (admin-api.md §4)", () => {
  function listRequest(query = ""): Request {
    return new Request(`http://localhost/api/admin/partnerships${query}`);
  }

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    expect((await listPartnerships(listRequest())).status).toBe(401);
  });

  it("forbids a role without partnerships:read (403)", async () => {
    authAs(await createUser("ContentManager"));
    expect((await listPartnerships(listRequest())).status).toBe(403);
  });

  it("lists requests for Sales/Business, newest first, filtered by status", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    await submitPartnership(jsonRequest(validFields({ company: "First Co" })));
    const second = await submitPartnership(jsonRequest(validFields({ company: "Second Co" })));
    const secondBody = await second.json();
    await prisma.partnershipRequest.update({
      where: { id: secondBody.id },
      data: { status: "contacted" },
    });

    const all = await listPartnerships(listRequest());
    const allBody = await all.json();
    expect(all.status).toBe(200);
    expect(allBody.total).toBe(2);

    const onlyNew = await listPartnerships(listRequest("?status=new"));
    const onlyNewBody = await onlyNew.json();
    expect(onlyNewBody.total).toBe(1);
    expect(onlyNewBody.items[0].company).toBe("First Co");
  });
});

describe("partnership pipeline + notes (SC-012)", () => {
  it("moves new → contacted, bumps the version, and writes one ActivityLog row", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitPartnership(jsonRequest(validFields()));
    const { id } = await created.json();

    const res = await changeStatus(
      new Request(`http://localhost/api/admin/partnerships/${id}/status`, {
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
      where: { entityType: "partnership", entityId: id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "statusChange", actorId: sales.id });
  });

  it("rejects an illegal transition with 400 and a stale version with 409", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitPartnership(jsonRequest(validFields()));
    const { id } = await created.json();

    const illegal = await changeStatus(
      new Request(`http://localhost/api/admin/partnerships/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "new", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(illegal.status).toBe(400);

    const stale = await changeStatus(
      new Request(`http://localhost/api/admin/partnerships/${id}/status`, {
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
    const created = await submitPartnership(jsonRequest(validFields()));
    const { id } = await created.json();

    const res = await updateNotes(
      new Request(`http://localhost/api/admin/partnerships/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "Scheduled a call.", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).notes).toBe("Scheduled a call.");

    const logs = await prisma.activityLog.findMany({ where: { entityId: id } });
    expect(logs.some((log) => log.action === "update")).toBe(true);
  });

  it("streams an attachment and records an attachmentAccess log (FR-035)", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitPartnership(
      multipartRequest(validFields(), {
        bytes: pdfBytes("deck-body"),
        name: "deck.pdf",
        type: "application/pdf",
      }),
    );
    const { id } = await created.json();

    const res = await downloadAttachment(
      new Request(`http://localhost/api/admin/partnerships/${id}/attachment`),
      { params: Promise.resolve({ id }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("deck.pdf");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(await res.text()).toContain("deck-body");

    const logs = await prisma.activityLog.findMany({
      where: { entityType: "partnership", entityId: id, action: "attachmentAccess" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(sales.id);
  });

  it("refuses to delete a partnership when not closed, deletes when closed along with attachment, and logs deletion", async () => {
    const sales = await createUser("SalesBusiness");
    authAs(sales);
    const created = await submitPartnership(
      multipartRequest(validFields(), {
        bytes: pdfBytes("delete-me"),
        name: "statement.pdf",
        type: "application/pdf",
      }),
    );
    const { id } = await created.json();

    // Check attachment exists in fake storage
    const reqRow = await prisma.partnershipRequest.findUnique({
      where: { id },
      include: { attachment: true },
    });
    expect(reqRow?.attachmentMediaId).toBeDefined();
    const mediaId = reqRow!.attachmentMediaId!;
    const storageKey = reqRow!.attachment!.storageKey;
    expect(storage.has(storageKey)).toBe(true);

    // Still 'new' -> 400 badRequest
    const refused = await deletePartnership(
      new Request(`http://localhost/api/admin/partnerships/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(refused.status).toBe(400);

    // Transition to closed
    await changeStatus(
      new Request(`http://localhost/api/admin/partnerships/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "closed", version: 1 }),
      }),
      { params: Promise.resolve({ id }) },
    );

    // Now delete succeeds
    const deleted = await deletePartnership(
      new Request(`http://localhost/api/admin/partnerships/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id, deleted: true });

    // Verifying row is gone from DB
    expect(await prisma.partnershipRequest.findUnique({ where: { id } })).toBeNull();
    // Verifying Media row is also gone
    expect(await prisma.media.findUnique({ where: { id: mediaId } })).toBeNull();
    // Verifying storage object is cleaned up
    expect(storage.has(storageKey)).toBe(false);

    // Verifying ActivityLog has "delete"
    const deleteLogs = await prisma.activityLog.findMany({
      where: { entityType: "partnership", entityId: id, action: "delete" },
    });
    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0].actorId).toBe(sales.id);
  });
});
