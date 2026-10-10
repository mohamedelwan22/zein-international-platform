import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  buildStorageKey,
  sniffMime,
  validateUpload,
} from "../../src/server/storage/validate";
import { httpStatusFor } from "../../src/server/http/errors";

/**
 * Security-sensitive upload validation (Constitution V, FR-033,
 * data-model.md §2.9): allowlist + magic bytes + size caps + randomized keys.
 * The sniffed type is authoritative — declared MIME values are never trusted.
 */

function png(bytes = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(bytes),
  ]);
}

function jpeg(bytes = 64): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes)]);
}

function webp(): Buffer {
  return Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "ascii"),
    Buffer.alloc(32),
  ]);
}

function avif(): Buffer {
  return Buffer.concat([
    Buffer.alloc(4),
    Buffer.from("ftypavif", "ascii"),
    Buffer.alloc(32),
  ]);
}

function pdf(): Buffer {
  return Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "binary");
}

function doc(): Buffer {
  return Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(64),
    Buffer.from("WordDocument", "ascii"),
    Buffer.alloc(64),
  ]);
}

function docx(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(16),
    Buffer.from("word/document.xml", "ascii"),
    Buffer.alloc(32),
  ]);
}

describe("magic-byte sniffing (T025)", () => {
  it.each([
    ["image/png", png()],
    ["image/jpeg", jpeg()],
    ["image/webp", webp()],
    ["image/avif", avif()],
    ["application/pdf", pdf()],
    ["application/msword", doc()],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docx(),
    ],
  ])("detects %s from bytes", (expected, buffer) => {
    expect(sniffMime(buffer)).toBe(expected);
  });

  it("rejects unknown and dangerous content regardless of declared type", () => {
    expect(sniffMime(Buffer.from("GIF89awhatever", "ascii"))).toBeNull();
    expect(sniffMime(Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(64)]))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("validateUpload (FR-033)", () => {
  it("accepts allowlisted images and assigns the image kind", () => {
    const result = validateUpload({ buffer: png(), declaredMime: "application/zip" });
    expect(result.kind).toBe("image");
    expect(result.mimeType).toBe("image/png");
    expect(result.byteSize).toBe(png().byteLength);
  });

  it("accepts allowlisted documents and assigns the document kind", () => {
    const result = validateUpload({ buffer: pdf() });
    expect(result.kind).toBe("document");
    expect(result.mimeType).toBe("application/pdf");
  });

  it("rejects non-allowlisted bytes with 415", () => {
    const error = (() => {
      try {
        validateUpload({ buffer: Buffer.from("GIF89a...", "ascii") });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).not.toBeNull();
    expect(httpStatusFor(error)).toBe(415);
  });

  it("rejects empty files with 415", () => {
    expect(() => validateUpload({ buffer: Buffer.alloc(0) })).toThrowError();
  });

  it("enforces the 10 MB image cap with 413", () => {
    const oversized = Buffer.concat([png(16).subarray(0, 8), Buffer.alloc(IMAGE_MAX_BYTES + 1)]);
    let error: unknown = null;
    try {
      validateUpload({ buffer: oversized });
    } catch (e) {
      error = e;
    }
    expect(httpStatusFor(error)).toBe(413);
  });

  it("enforces the 20 MB document cap with 413", () => {
    const oversized = Buffer.concat([pdf(), Buffer.alloc(DOCUMENT_MAX_BYTES + 1)]);
    let error: unknown = null;
    try {
      validateUpload({ buffer: oversized });
    } catch (e) {
      error = e;
    }
    expect(httpStatusFor(error)).toBe(413);
  });

  it("allows a document at exactly the cap", () => {
    const atCap = Buffer.concat([pdf(), Buffer.alloc(DOCUMENT_MAX_BYTES - pdf().byteLength)]);
    const result = validateUpload({ buffer: atCap });
    expect(result.byteSize).toBe(DOCUMENT_MAX_BYTES);
  });
});

describe("randomized storage keys (FR-033)", () => {
  it("never uses the original filename and is unique per upload", () => {
    const upload = validateUpload({ buffer: png() });
    const key1 = buildStorageKey(upload);
    const key2 = buildStorageKey(upload);
    expect(key1).toMatch(/^images\/[0-9a-f-]{36}\.png$/);
    expect(key1).not.toBe(key2);
  });

  it("routes documents into the documents/ prefix with the sniffed extension", () => {
    const upload = validateUpload({ buffer: docx() });
    expect(buildStorageKey(upload)).toMatch(/^documents\/[0-9a-f-]{36}\.docx$/);
  });
});
