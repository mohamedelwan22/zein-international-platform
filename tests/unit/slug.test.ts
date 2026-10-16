import { describe, expect, it } from "vitest";
import { decodeSlugParam } from "@/lib/slug";

/**
 * BUG-001 — dynamic route slug params.
 *
 * Next.js hands dynamically rendered pages the raw (percent-encoded) path
 * segment for non-ASCII slugs, while route handlers and prerendered pages get
 * them already decoded. `decodeSlugParam` bridges that inconsistency so a
 * localized (Arabic) slug always matches the stored value.
 */
describe("decodeSlugParam", () => {
  it("decodes a percent-encoded non-ASCII (Arabic) slug", () => {
    expect(decodeSlugParam("%D9%84%D8%A7%D9%84%D8%A7%D8%A7")).toBe("لالاا");
  });

  it("decodes a mixed ASCII + non-ASCII slug", () => {
    expect(decodeSlugParam("alpha-%D9%84%D8%A7-saudi")).toBe("alpha-لا-saudi");
  });

  it("leaves an already-decoded slug unchanged (idempotent)", () => {
    expect(decodeSlugParam("personal-care-cosmetic-accessories")).toBe(
      "personal-care-cosmetic-accessories",
    );
    expect(decodeSlugParam("لالاا")).toBe("لالاا");
  });

  it("decodes an ASCII percent escape once, not repeatedly", () => {
    expect(decodeSlugParam("%25")).toBe("%");
    expect(decodeSlugParam("%2525")).toBe("%25");
  });

  it("returns malformed encodings unchanged instead of throwing", () => {
    expect(decodeSlugParam("%ZZ")).toBe("%ZZ");
    expect(decodeSlugParam("50%")).toBe("50%");
  });
});
