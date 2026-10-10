import { env } from "@/lib/env";
import { s3Storage } from "./s3";
import type { MediaStorage } from "./types";

/**
 * Storage provider isolation (T024, plan Media Architecture).
 *
 * The MVP ships exactly one driver: S3-compatible (MinIO in dev). Any future
 * provider swap happens here — no other module references the driver.
 *
 * Public URL strategy: how media URLs are exposed (app-proxied route vs
 * signed URLs) is decided when the media admin module lands (T091,
 * contracts/README.md §9 leaves it to implementation) — storage primitives
 * here stay URL-agnostic on purpose.
 */

const globalForStorage = globalThis as unknown as {
  zeinMediaStorage?: MediaStorage;
};

export function getMediaStorage(): MediaStorage {
  if (!globalForStorage.zeinMediaStorage) {
    globalForStorage.zeinMediaStorage = s3Storage;
  }
  return globalForStorage.zeinMediaStorage;
}

export function getBucketName(): string {
  return env.S3_BUCKET;
}
