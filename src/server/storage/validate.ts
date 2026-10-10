import { randomUUID } from "node:crypto";
import { payloadTooLarge, unsupportedMediaType } from "@/server/http/errors";

/**
 * Upload validation (T025, FR-033, data-model.md §2.9).
 *
 * - Allowlist: png, jpg, webp, avif (images); pdf, doc, docx (documents)
 * - Magic-byte sniffing: the file's actual bytes decide the type — declared
 *   MIME/filenames are never trusted
 * - Size caps: images ≤ 10 MB, documents ≤ 20 MB
 * - Randomized storage keys: the original name is never used as a path
 *
 * Violations throw the contract error envelope: 415 UNSUPPORTED_MEDIA_TYPE
 * for disallowed/mismatched content, 413 PAYLOAD_TOO_LARGE for size.
 */

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
] as const;

export const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type UploadKind = "image" | "document";

export interface ValidatedUpload {
  kind: UploadKind;
  /** MIME derived from magic bytes (never from the client). */
  mimeType: string;
  byteSize: number;
  buffer: Buffer;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean => {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
};

const equalsAscii = (buffer: Buffer, text: string, offset: number): boolean => {
  if (buffer.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buffer[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/**
 * Detect the real content type from magic bytes. Returns null for unknown or
 * non-allowlisted content.
 */
export function sniffMime(buffer: Buffer): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // WebP: "RIFF" … "WEBP"
  if (equalsAscii(buffer, "RIFF", 0) && equalsAscii(buffer, "WEBP", 8)) {
    return "image/webp";
  }
  // AVIF/AVIS ISO-BMFF: "ftyp" at offset 4 with a supported brand at offset 8.
  if (equalsAscii(buffer, "ftyp", 4)) {
    if (equalsAscii(buffer, "avif", 8) || equalsAscii(buffer, "avis", 8)) {
      return "image/avif";
    }
    return null;
  }
  // PDF: "%PDF"
  if (equalsAscii(buffer, "%PDF", 0)) {
    return "application/pdf";
  }
  // Legacy Office (OLE2) — covers .doc (and would also match .xls etc., so we
  // additionally require the Word stream marker "Word" early in the file).
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const window = buffer.subarray(0, 4096);
    if (window.includes(Buffer.from("WordDocument", "ascii"))) {
      return "application/msword";
    }
    return null;
  }
  // OOXML/DOCX: ZIP container (PK\x03\x04) containing a WordprocessingML part.
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const window = buffer.subarray(0, 8192);
    if (window.includes(Buffer.from("word/", "ascii"))) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return null;
  }
  return null;
}

/**
 * Validate an uploaded file (kind decided by magic bytes) against the
 * allowlist and size caps. Throws HttpError (415/413) on rejection.
 */
export function validateUpload(input: {
  buffer: Buffer;
  declaredMime?: string | null;
}): ValidatedUpload {
  const { buffer } = input;

  if (buffer.byteLength === 0) {
    throw unsupportedMediaType("Empty file");
  }

  const sniffed = sniffMime(buffer);
  if (!sniffed) {
    throw unsupportedMediaType();
  }

  const isImage = (ALLOWED_IMAGE_MIME as readonly string[]).includes(sniffed);
  const isDocument = (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(sniffed);
  if (!isImage && !isDocument) {
    throw unsupportedMediaType();
  }

  const kind: UploadKind = isImage ? "image" : "document";
  const cap = isImage ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES;
  if (buffer.byteLength > cap) {
    throw payloadTooLarge();
  }

  return {
    kind,
    mimeType: sniffed,
    byteSize: buffer.byteLength,
    buffer,
  };
}

/**
 * Randomized storage key (FR-033): `images/` or `documents/` + UUID +
 * extension derived from the SNIFFED type. The original filename is stored
 * for display only and never used as a path (data-model.md §2.9).
 */
export function buildStorageKey(upload: ValidatedUpload): string {
  const extension = EXTENSION_BY_MIME[upload.mimeType] ?? "bin";
  return `${upload.kind === "image" ? "images" : "documents"}/${randomUUID()}.${extension}`;
}
