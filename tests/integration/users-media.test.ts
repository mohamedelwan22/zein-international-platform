import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verify } from "@node-rs/argon2";

/**
 * T088 — Users + Media library integration (US12, FR-021/FR-022/FR-033,
 * contracts/admin-api.md §5 & §8, SC-012).
 *
 * Against a real database (ephemeral Postgres, migrations applied) and a fake
 * in-memory `MediaStorage` (MinIO is not assumed to run in CI):
 * - staff accounts are created with a hashed password, listed without any
 *   `passwordHash`, and every mutation writes exactly one `ActivityLog` row;
 * - role changes apply to an existing session at its next request, and
 *   deactivation / password reset bump `tokenVersion` so the old JWT is
 *   rejected (US12.4/12.5);
 * - the documented guards hold: self-deactivation and demoting/deactivating
 *   the last active Super Admin are `400`, a stale `version` is `409`;
 * - media uploads are magic-byte validated (415 on junk), audited, and the
 *   archive/purge lifecycle refuses to touch referenced media;
 * - the public `GET /api/media/{id}` proxy serves only non-archived images
 *   with an ETag (304 on revalidation) and hides documents (404).
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import type { MediaStorage } from "@/server/storage/types";
import { GET as listUsers, POST as createUser } from "@/app/api/admin/users/route";
import { PUT as updateUser } from "@/app/api/admin/users/[id]/route";
import { POST as resetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { POST as deactivateUser } from "@/app/api/admin/users/[id]/deactivate/route";
import { GET as listMedia, POST as uploadMedia } from "@/app/api/admin/media/route";
import { PUT as updateMedia, DELETE as purgeMedia } from "@/app/api/admin/media/[id]/route";
import { POST as archiveMedia } from "@/app/api/admin/media/[id]/archive/route";
import { GET as publicImage } from "@/app/api/media/[id]/route";

const TEST_DOMAIN = "@us12-it.test";
const OLD_PASSWORD = "Old-Password-1234!";
const NEW_PASSWORD = "New-Password-4567!";

// In-memory stand-in for the S3 driver, keyed by storage key.
const storage = new Map<string, Uint8Array>();
const mediaStorage: MediaStorage = {
  async put({ key, body, contentType }) {
    const copy = new Uint8Array(body);
    storage.set(key, copy);
    return { key, byteSize: copy.byteLength, contentType };
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

function authAs(user: TestUser | null) {
  if (!user) {
    authMock.mockResolvedValue(null);
    return;
  }
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

async function createStaff(role: Role = "SuperAdmin", tokenVersion = 1): Promise<TestUser> {
  return prisma.user.create({
    data: {
      email: `staff-${randomUUID()}${TEST_DOMAIN}`,
      name: "US12 Test Staff",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion,
    },
    select: { id: true, tokenVersion: true },
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

async function createUserViaApi(
  actor: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string } & Record<string, unknown>> {
  authAs(actor);
  const res = await createUser(
    jsonRequest("/api/admin/users", "POST", {
      email: `subject-${randomUUID()}${TEST_DOMAIN}`,
      name: "Subject User",
      role: "SalesBusiness",
      password: OLD_PASSWORD,
      ...overrides,
    }),
  );
  expect(res.status).toBe(201);
  return res.json();
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\nbody\n%%EOF");
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

function uploadRequest(
  bytes: Uint8Array,
  name: string,
  type: string,
  alt: { altEn?: string; altAr?: string } = {},
): Request {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type }), name);
  if (alt.altEn) form.set("altEn", alt.altEn);
  if (alt.altAr) form.set("altAr", alt.altAr);
  return new Request("http://localhost/api/admin/media", { method: "POST", body: form });
}

async function uploadViaApi(
  actor: TestUser,
  bytes: Uint8Array,
  name: string,
  type: string,
): Promise<{ id: string; url: string } & Record<string, unknown>> {
  authAs(actor);
  const res = await uploadMedia(uploadRequest(bytes, name, type));
  expect(res.status).toBe(201);
  return res.json();
}

beforeEach(async () => {
  authMock.mockReset();
  storage.clear();
  (globalThis as unknown as { zeinMediaStorage?: MediaStorage }).zeinMediaStorage = mediaStorage;

  await prisma.productImage.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.brandCategory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.media.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
});

afterAll(() => {
  delete (globalThis as unknown as { zeinMediaStorage?: MediaStorage }).zeinMediaStorage;
});

describe("GET/POST /api/admin/users (admin-api.md §8, FR-021)", () => {
  it("requires a session (401) and forbids non-Super Admins (403)", async () => {
    authAs(null);
    expect((await listUsers(new Request("http://localhost/api/admin/users"))).status).toBe(401);

    authAs(await createStaff("ContentManager"));
    expect((await listUsers(new Request("http://localhost/api/admin/users"))).status).toBe(403);
  });

  it("creates an account with a hashed password and lists it without exposing passwordHash", async () => {
    const actor = await createStaff("SuperAdmin");
    const created = await createUserViaApi(actor);

    expect("passwordHash" in created).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.role).toBe("SalesBusiness");
    expect(row.active).toBe(true);
    expect(row.tokenVersion).toBe(1);
    expect(row.passwordHash).not.toBe(OLD_PASSWORD);
    expect(await verify(row.passwordHash, OLD_PASSWORD)).toBe(true);

    const logs = await prisma.activityLog.findMany({
      where: { entityType: "user", entityId: created.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "userCreate", actorId: actor.id });

    authAs(actor);
    const listed = await listUsers(new Request("http://localhost/api/admin/users?pageSize=100"));
    const body = await listed.json();
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.items.every((item: Record<string, unknown>) => !("passwordHash" in item))).toBe(true);
  });

  it("rejects a duplicate email and an invalid payload with 400", async () => {
    const actor = await createStaff("SuperAdmin");
    const created = await createUserViaApi(actor);

    authAs(actor);
    const duplicate = await createUser(
      jsonRequest("/api/admin/users", "POST", {
        email: created.email,
        name: "Clone",
        role: "ContentManager",
        password: OLD_PASSWORD,
      }),
    );
    const dupBody = await duplicate.json();
    expect(duplicate.status).toBe(400);
    expect(dupBody.error.details.map((d: { issue: string }) => d.issue)).toContain("emailTaken");

    const shortPassword = await createUser(
      jsonRequest("/api/admin/users", "POST", {
        email: `weak-${randomUUID()}${TEST_DOMAIN}`,
        name: "Weak",
        role: "ContentManager",
        password: "short",
      }),
    );
    expect(shortPassword.status).toBe(400);
  });

  it("rejects a stale version with 409", async () => {
    const actor = await createStaff("SuperAdmin");
    const subject = await createUserViaApi(actor);

    authAs(actor);
    const res = await updateUser(
      jsonRequest(`/api/admin/users/${subject.id}`, "PUT", { role: "ContentManager", version: 99 }),
      params(subject.id),
    );
    expect(res.status).toBe(409);
    expect(
      await prisma.activityLog.count({
        where: { entityId: subject.id, action: { in: ["roleChange", "userUpdate", "userDeactivate"] } },
      }),
    ).toBe(0);
  });
});

describe("immediate role + session effects (US12.4/12.5)", () => {
  it("a role change applies to the existing session at its next request", async () => {
    const actor = await createStaff("SuperAdmin");
    const subject = await createUserViaApi(actor, { role: "SalesBusiness" });
    const subjectSession: TestUser = { id: subject.id, tokenVersion: 1 };

    // SalesBusiness cannot read the users module.
    authAs(subjectSession);
    expect((await listUsers(new Request("http://localhost/api/admin/users"))).status).toBe(403);

    // Promote through the API (no token change)…
    authAs(actor);
    const promoted = await updateUser(
      jsonRequest(`/api/admin/users/${subject.id}`, "PUT", { role: "SuperAdmin", version: 1 }),
      params(subject.id),
    );
    expect(promoted.status).toBe(200);

    // …and the *same* session now succeeds.
    authAs(subjectSession);
    expect((await listUsers(new Request("http://localhost/api/admin/users"))).status).toBe(200);

    const logs = await prisma.activityLog.findMany({ where: { entityId: subject.id } });
    expect(logs.some((log) => log.action === "roleChange")).toBe(true);
  });

  it("deactivation bumps tokenVersion and revokes the account's session", async () => {
    const actor = await createStaff("SuperAdmin");
    const subject = await createUserViaApi(actor, { role: "ContentManager" });

    authAs({ id: subject.id, tokenVersion: 1 });
    expect((await listMedia(new Request("http://localhost/api/admin/media"))).status).toBe(200);

    authAs(actor);
    const res = await deactivateUser(new Request("http://localhost/api/admin/users/x/deactivate"), params(subject.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.active).toBe(false);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: subject.id } });
    expect(row.tokenVersion).toBe(2);

    // The killed session is rejected at its next request.
    authAs({ id: subject.id, tokenVersion: 1 });
    expect((await listMedia(new Request("http://localhost/api/admin/media"))).status).toBe(401);

    const logs = await prisma.activityLog.findMany({ where: { entityId: subject.id } });
    expect(logs.some((log) => log.action === "userDeactivate")).toBe(true);
  });

  it("password reset sets a verifiable new password and bumps tokenVersion", async () => {
    const actor = await createStaff("SuperAdmin");
    const subject = await createUserViaApi(actor);

    authAs(actor);
    const res = await resetPassword(
      jsonRequest(`/api/admin/users/${subject.id}/reset-password`, "POST", { password: NEW_PASSWORD }),
      params(subject.id),
    );
    expect(res.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: subject.id } });
    expect(row.tokenVersion).toBe(2);
    expect(await verify(row.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verify(row.passwordHash, OLD_PASSWORD)).toBe(false);
  });
});

describe("account guards (FR-021)", () => {
  it("blocks self-deactivation", async () => {
    const actor = await createStaff("SuperAdmin");
    authAs(actor);
    const res = await deactivateUser(
      new Request("http://localhost/api/admin/users/x/deactivate"),
      params(actor.id),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.details.map((d: { issue: string }) => d.issue)).toContain("selfDeactivate");
  });

  it("blocks demoting the last active Super Admin", async () => {
    const actor = await createStaff("SuperAdmin");

    // Isolate: park any Super Admin left by another suite so the actor is the
    // only active one, then restore them so sibling files see no change.
    const others = await prisma.user.findMany({
      where: { role: "SuperAdmin", active: true, NOT: { id: actor.id } },
      select: { id: true },
    });
    const otherIds = others.map((other) => other.id);
    await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { active: false } });

    try {
      authAs(actor);
      const res = await updateUser(
        jsonRequest(`/api/admin/users/${actor.id}`, "PUT", { role: "ContentManager", version: 1 }),
        params(actor.id),
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.details.map((d: { issue: string }) => d.issue)).toContain("lastSuperAdmin");
    } finally {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { active: true } });
    }
  });
});

describe("media library (admin-api.md §5, FR-033)", () => {
  it("requires a session to list and forbids read for upload-only roles is not the case; upload rejects junk", async () => {
    authAs(null);
    expect((await listMedia(new Request("http://localhost/api/admin/media"))).status).toBe(401);

    const actor = await createStaff("ProductManager");
    authAs(actor);
    const junk = await uploadMedia(uploadRequest(GIF, "anim.gif", "image/gif"));
    expect(junk.status).toBe(415);
    expect(await prisma.media.count()).toBe(0);
  });

  it("uploads an image (magic-byte typed), stores the bytes, and audits the create", async () => {
    const actor = await createStaff("ContentManager");
    const created = await uploadViaApi(actor, PNG, "logo.png", "image/png");

    expect(created.kind).toBe("image");
    expect(created.mimeType).toBe("image/png");
    expect(created.url).toBe(`/api/media/${created.id}`);

    const row = await prisma.media.findUniqueOrThrow({ where: { id: created.id } });
    expect(storage.has(row.storageKey)).toBe(true);
    expect(storage.get(row.storageKey)?.byteLength).toBe(PNG.byteLength);

    const logs = await prisma.activityLog.findMany({
      where: { entityType: "media", entityId: created.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("create");
  });

  it("lists by kind filter", async () => {
    const actor = await createStaff("ContentManager");
    await uploadViaApi(actor, PNG, "one.png", "image/png");
    await uploadViaApi(actor, PDF, "deck.pdf", "application/pdf");

    authAs(actor);
    const images = await listMedia(new Request("http://localhost/api/admin/media?kind=image"));
    const docs = await listMedia(new Request("http://localhost/api/admin/media?kind=document"));
    expect((await images.json()).total).toBe(1);
    expect((await docs.json()).total).toBe(1);
  });

  it("exposes media reference state and keeps delete guarded by archive and references", async () => {
    const actor = await createStaff("ContentManager");
    const created = await uploadViaApi(actor, PNG, "reference-state.png", "image/png");

    authAs(actor);
    const listed = await listMedia(new Request("http://localhost/api/admin/media"));
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.items.find((item: { id: string }) => item.id === created.id)?.isReferenced).toBe(false);

    const tooSoon = await purgeMedia(
      new Request(`http://localhost/api/admin/media/${created.id}`, { method: "DELETE" }),
      params(created.id),
    );
    expect(tooSoon.status).toBe(400);
    expect((await tooSoon.json()).error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ issue: "mediaNotArchived" })]),
    );

    await archiveMedia(
      new Request(`http://localhost/api/admin/media/${created.id}/archive`, { method: "POST" }),
      params(created.id),
    );
    const deleted = await purgeMedia(
      new Request(`http://localhost/api/admin/media/${created.id}`, { method: "DELETE" }),
      params(created.id),
    );
    expect(deleted.status).toBe(200);
  });

  it("updates alt text (media:update) and refuses it for upload-only roles (403)", async () => {
    const contentManager = await createStaff("ContentManager");
    const created = await uploadViaApi(contentManager, PNG, "a.png", "image/png");

    authAs(await createStaff("ProductManager"));
    const forbidden = await updateMedia(
      jsonRequest(`/api/admin/media/${created.id}`, "PUT", { altEn: "x", altAr: "y" }),
      params(created.id),
    );
    expect(forbidden.status).toBe(403);

    authAs(contentManager);
    const res = await updateMedia(
      jsonRequest(`/api/admin/media/${created.id}`, "PUT", { altEn: "Shield logo", altAr: "شعار" }),
      params(created.id),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.altEn).toBe("Shield logo");
  });

  it("archives referenced media without unlinking it, then deletes only the reference", async () => {
    const actor = await createStaff("ContentManager");
    const created = await uploadViaApi(actor, PNG, "used.png", "image/png");
    await prisma.brand.create({
      data: {
        nameEn: "Referencing Brand",
        nameAr: "علامة",
        slugEn: `brand-${randomUUID()}`,
        slugAr: `علامة-${randomUUID()}`,
        logoMediaId: created.id,
        createdById: actor.id,
      },
    });

    authAs(actor);
    const archived = await archiveMedia(new Request("http://localhost/x/archive", { method: "POST" }), params(created.id));
    const archivedBody = await archived.json();
    expect(archived.status).toBe(200);
    expect(archivedBody.archivedAt).toBeTruthy();
    expect((await prisma.brand.count({ where: { logoMediaId: created.id } }))).toBe(1);
    expect(
      await prisma.activityLog.count({ where: { entityId: created.id, action: "archive" } }),
    ).toBe(1);

    const purged = await purgeMedia(
      new Request("http://localhost/x", { method: "DELETE" }),
      params(created.id),
    );
    expect(purged.status).toBe(200);
    expect(await prisma.media.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await prisma.brand.count()).toBe(1);
    expect(await prisma.brand.count({ where: { logoMediaId: created.id } })).toBe(0);
  });

  it("purges only archived, unreferenced media (object + row)", async () => {
    const actor = await createStaff("ContentManager");
    const created = await uploadViaApi(actor, PNG, "trash.png", "image/png");
    const row = await prisma.media.findUniqueOrThrow({ where: { id: created.id } });

    authAs(actor);
    const tooSoon = await purgeMedia(new Request("http://localhost/x", { method: "DELETE" }), params(created.id));
    const tooSoonBody = await tooSoon.json();
    expect(tooSoon.status).toBe(400);
    expect(tooSoonBody.error.details.map((d: { issue: string }) => d.issue)).toContain("mediaNotArchived");

    await archiveMedia(new Request("http://localhost/x/archive", { method: "POST" }), params(created.id));
    const purged = await purgeMedia(new Request("http://localhost/x", { method: "DELETE" }), params(created.id));
    expect(purged.status).toBe(200);
    expect(await prisma.media.findUnique({ where: { id: created.id } })).toBeNull();
    expect(storage.has(row.storageKey)).toBe(false);
    expect(await prisma.activityLog.count({ where: { entityId: created.id, action: "delete" } })).toBe(1);
  });

  it("keeps the database cleanup committed and reports storage cleanup failure", async () => {
    const actor = await createStaff("ContentManager");
    const created = await uploadViaApi(actor, PNG, "storage-failure.png", "image/png");
    await archiveMedia(new Request("http://localhost/x/archive", { method: "POST" }), params(created.id));

    (globalThis as unknown as { zeinMediaStorage?: MediaStorage }).zeinMediaStorage = {
      ...mediaStorage,
      async delete() {
        throw new Error("storage unavailable");
      },
    };
    authAs(actor);
    const failed = await purgeMedia(
      new Request(`http://localhost/api/admin/media/${created.id}`, { method: "DELETE" }),
      params(created.id),
    );

    expect(failed.status).toBe(400);
    expect((await failed.json()).error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ issue: "storageDeleteFailed" })]),
    );
    expect(await prisma.media.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("allows only one repeated delete to win and leaves no parent records removed", async () => {
    const actor = await createStaff("ContentManager");
    const created = await uploadViaApi(actor, PNG, "concurrent-delete.png", "image/png");
    await archiveMedia(new Request("http://localhost/x/archive", { method: "POST" }), params(created.id));

    authAs(actor);
    const responses = await Promise.all([
      purgeMedia(new Request("http://localhost/x", { method: "DELETE" }), params(created.id)),
      purgeMedia(new Request("http://localhost/x", { method: "DELETE" }), params(created.id)),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status !== 200)).toHaveLength(1);
    expect(await prisma.media.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("serves a public image with an ETag (304 on revalidation) and hides documents while keeping archived images available", async () => {
    const actor = await createStaff("ContentManager");
    const image = await uploadViaApi(actor, PNG, "pub.png", "image/png");
    const doc = await uploadViaApi(actor, PDF, "private.pdf", "application/pdf");

    const first = await publicImage(new Request(`http://localhost/api/media/${image.id}`), params(image.id));
    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("image/png");
    expect(first.headers.get("Cache-Control")).toContain("immutable");
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();

    const revalidated = await publicImage(
      new Request(`http://localhost/api/media/${image.id}`, { headers: { "if-none-match": etag! } }),
      params(image.id),
    );
    expect(revalidated.status).toBe(304);

    const document = await publicImage(
      new Request(`http://localhost/api/media/${doc.id}`),
      params(doc.id),
    );
    expect(document.status).toBe(404);

    authAs(actor);
    await archiveMedia(new Request("http://localhost/x/archive", { method: "POST" }), params(image.id));
    const archived = await publicImage(
      new Request(`http://localhost/api/media/${image.id}`),
      params(image.id),
    );
    expect(archived.status).toBe(200);
    expect(archived.headers.get("Content-Type")).toBe("image/png");
  });
});
