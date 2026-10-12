import "dotenv/config";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { hash } from "@node-rs/argon2";
import { Client } from "pg";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T047 [US3] — Playwright global setup.
 *
 * Ensures the four role accounts exist in the dev database (idempotent
 * upsert by email), so the auth/RBAC E2E spec can sign in as each documented
 * role. Test-only accounts live under the `us3-e2e.test` domain and are
 * never part of the approved content seed.
 *
 * T062 [US5] — additionally ensures the media bucket exists, so the
 * partnership attachment journey (upload + audited download) is
 * self-contained against `docker compose up -d` without an out-of-band bucket
 * provisioning step.
 */
async function ensureMediaBucket(): Promise<void> {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9100",
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    },
  });
  const bucket = process.env.S3_BUCKET ?? "zein-media";

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } finally {
    client.destroy();
  }
}

export default async function globalSetup() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("E2E global setup requires DATABASE_URL (see .env.example)");
  }

  await ensureMediaBucket();

  const passwordHash = await hash(E2E_PASSWORD);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (const user of Object.values(E2E_USERS)) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "active", "tokenVersion", "failedLogins", "lockedUntil", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4::"Role", true, 1, 0, NULL, now(), now())
         ON CONFLICT ("email") DO UPDATE SET
           "name" = EXCLUDED."name",
           "passwordHash" = EXCLUDED."passwordHash",
           "role" = EXCLUDED."role",
           "active" = true,
           "tokenVersion" = 1,
           "failedLogins" = 0,
           "lockedUntil" = NULL,
           "updatedAt" = now()`,
        [user.email, user.name, passwordHash, user.role],
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}
