import { describe, expect, it } from "vitest";
import en from "../../src/i18n/messages/en.json";
import ar from "../../src/i18n/messages/ar.json";
import { pickLocalized } from "../../src/i18n/localized";
import { dirForLocale, isAppLocale } from "../../src/i18n/routing";

/**
 * T027 [US1] — message-key parity between en.json/ar.json (same keys,
 * non-empty) and locale fallback behavior (spec edge case).
 */

/** Collect the full dotted-key set of a nested messages object. */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) return keyPaths(value, path);
    return [path];
  });
}

function emptyLeaves(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) return emptyLeaves(value, path);
    return typeof value === "string" && value.trim().length === 0 ? [path] : [];
  });
}

describe("i18n message-key parity (FR-003)", () => {
  it("en and ar expose exactly the same key set", () => {
    expect(new Set(keyPaths(ar))).toEqual(new Set(keyPaths(en)));
  });

  it("no message value is empty in either locale", () => {
    expect(emptyLeaves(en)).toEqual([]);
    expect(emptyLeaves(ar)).toEqual([]);
  });

  it("core UI-chrome namespaces exist (nav, forms, errors, empty states)", () => {
    for (const ns of ["nav", "languageSwitch", "errors", "empty", "validation", "auth"]) {
      expect(keyPaths(en).some((k) => k.startsWith(`${ns}.`)), `missing ${ns}`).toBe(true);
    }
  });
});

describe("locale fallback (spec edge case)", () => {
  it("uses the active locale when present", () => {
    expect(pickLocalized("en", { en: "Hello", ar: "مرحبا" })).toEqual({
      text: "Hello",
      locale: "en",
      fallbackUsed: false,
    });
  });

  it("falls back to the available approved variant and flags it", () => {
    expect(pickLocalized("ar", { en: "Hello", ar: null })).toEqual({
      text: "Hello",
      locale: "en",
      fallbackUsed: true,
    });
    expect(pickLocalized("en", { en: "", ar: "مرحبا" })).toEqual({
      text: "مرحبا",
      locale: "ar",
      fallbackUsed: true,
    });
  });

  it("returns null when neither locale has a value (element is hidden)", () => {
    expect(pickLocalized("en", { en: null, ar: undefined })).toBeNull();
    expect(pickLocalized("ar", null)).toBeNull();
  });

  it("whitespace-only values are treated as missing", () => {
    expect(pickLocalized("en", { en: "   ", ar: "مرحبا" })?.fallbackUsed).toBe(true);
  });
});

describe("routing helpers", () => {
  it("recognizes valid app locales only", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("ar")).toBe(true);
    expect(isAppLocale("fr")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
  });

  it("maps locales to the correct direction (FR-002)", () => {
    expect(dirForLocale("en")).toBe("ltr");
    expect(dirForLocale("ar")).toBe("rtl");
  });
});
