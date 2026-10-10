/**
 * MediaStorage interface (T024, plan Media Architecture).
 *
 * The rest of the app depends only on this interface; the concrete driver
 * (S3-compatible/MinIO today) is isolated behind `getMediaStorage()` in
 * `config.ts`. Swapping providers later touches exactly one file.
 */
export interface PutObjectParams {
  /** Randomized storage key from `buildStorageKey` (FR-033). */
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface StoredObject {
  key: string;
  byteSize: number;
  contentType: string;
}

export interface RetrievedObject {
  body: Uint8Array;
  contentType?: string;
  byteSize: number;
}

export interface MediaStorage {
  put(params: PutObjectParams): Promise<StoredObject>;
  get(key: string): Promise<RetrievedObject>;
  delete(key: string): Promise<void>;
}
