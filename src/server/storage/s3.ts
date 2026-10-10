import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import type {
  MediaStorage,
  PutObjectParams,
  RetrievedObject,
  StoredObject,
} from "./types";

/**
 * S3-compatible driver (T024) — works with MinIO in dev (S3_ENDPOINT) and
 * any S3-compatible provider in production. Path-style addressing keeps
 * MinIO bucket addressing correct.
 */

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }
  return cachedClient;
}

/** Test hook: drop the cached client (env changes between tests). */
export function resetStorageClient(): void {
  cachedClient = null;
}

export const s3Storage: MediaStorage = {
  async put(params: PutObjectParams): Promise<StoredObject> {
    const client = getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
    return {
      key: params.key,
      byteSize: params.body.byteLength,
      contentType: params.contentType,
    };
  },

  async get(key: string): Promise<RetrievedObject> {
    const client = getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    const body = await response.Body?.transformToByteArray();
    if (!body) {
      throw new Error(`Empty object body for storage key`);
    }
    return {
      body,
      contentType: response.ContentType,
      byteSize: body.byteLength,
    };
  },

  async delete(key: string): Promise<void> {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },
};
