import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";

/**
 * Platform system account (T063, FR-018/FR-033).
 *
 * `Media.uploadedById` is a required FK, but partnership attachments arrive
 * through the anonymous public form where no visitor identity exists. One
 * dedicated, non-loginable account owns such platform-origin media:
 *
 *   - `active: false` — `getSessionUser`/credentials sign-in reject it, so it
 *     can never be used to authenticate;
 *   - the stored "hash" is random and not a valid Argon2 string, so a
 *     credential comparison can never succeed even if the flag were flipped;
 *   - `ContentManager` role keeps it within the media-owning part of the
 *     permission matrix (the account is never used for authorization checks).
 *
 * Lookup-then-upsert keeps creation idempotent under concurrent uploads.
 */

const SYSTEM_UPLOADER_EMAIL = "system-uploader@zain.local";

const logger = createLogger("system-user");

export async function getSystemUploaderId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_UPLOADER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.upsert({
    where: { email: SYSTEM_UPLOADER_EMAIL },
    create: {
      email: SYSTEM_UPLOADER_EMAIL,
      name: "System (public uploads)",
      passwordHash: `disabled:${randomUUID()}${randomUUID()}`,
      role: "ContentManager",
      active: false,
    },
    update: {},
    select: { id: true },
  });

  logger.info({ userId: created.id }, "Created non-loginable system uploader account");
  return created.id;
}
