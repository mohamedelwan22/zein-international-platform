import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsSearchUrl,
  GOOGLE_MAPS_EMBED_MAX_LENGTH,
  normalizeGoogleMapsEmbedUrl,
} from "@/lib/google-maps-embed";

/**
 * Location map embeds are staff-supplied URLs, so only the documented Google
 * Maps embed surfaces may reach the public iframe. Anything else — another
 * origin, plain http, credentials, or a non-embed path — is treated as absent.
 */

describe("normalizeGoogleMapsEmbedUrl", () => {
  it("accepts the official Google Maps embed surfaces", () => {
    const urls = [
      "https://www.google.com/maps/embed?pb=!1m18!1m12",
      "https://www.google.com/maps/embed/",
      "https://google.com/maps/embed/v1/place?key=abc&q=Jeddah",
      "https://maps.google.com/maps?q=Jeddah&output=embed",
      "https://www.google.com/maps/d/embed?mid=abc",
    ];

    for (const url of urls) {
      expect(normalizeGoogleMapsEmbedUrl(url)).toBe(url);
    }
  });

  it("extracts and normalizes the src from a pasted iframe snippet", () => {
    const snippet =
      '<iframe src="https://www.google.com/maps/embed?pb=abc&amp;hl=en" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';

    expect(normalizeGoogleMapsEmbedUrl(snippet)).toBe(
      "https://www.google.com/maps/embed?pb=abc&hl=en",
    );
    expect(
      normalizeGoogleMapsEmbedUrl(
        "<IFRAME width='600' SRC='https://maps.google.com/maps?q=Jeddah&amp;output=embed'></IFRAME>",
      ),
    ).toBe("https://maps.google.com/maps?q=Jeddah&output=embed");
  });

  it("recovers the URL from a partial paste that omitted the opening iframe tag", () => {
    expect(
      normalizeGoogleMapsEmbedUrl(
        'https://www.google.com/maps/embed?pb=abc" width="600" height="450" style="border:0;"',
      ),
    ).toBe("https://www.google.com/maps/embed?pb=abc");
    expect(
      normalizeGoogleMapsEmbedUrl(
        "src='https://www.google.com/maps/embed/v1/place?key=abc' width='600'",
      ),
    ).toBe("https://www.google.com/maps/embed/v1/place?key=abc");
  });

  it("rejects iframe snippets that are not an allowed Google Maps embed", () => {
    const snippets = [
      '<iframe src="https://evil.example/maps/embed?pb=abc"></iframe>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<iframe src="https://www.google.com/maps/place/Jeddah"></iframe>',
      '<iframe width="600" height="450"></iframe>',
      '<div><iframe src="https://www.google.com/maps/embed?pb=abc"></iframe></div>',
      '<script src="https://www.google.com/maps/embed?pb=abc"></script>',
    ];

    for (const snippet of snippets) {
      expect(normalizeGoogleMapsEmbedUrl(snippet)).toBeNull();
    }
  });

  it("trims surrounding whitespace", () => {
    expect(
      normalizeGoogleMapsEmbedUrl("  https://www.google.com/maps/embed?pb=abc  "),
    ).toBe("https://www.google.com/maps/embed?pb=abc");
  });

  it("rejects non-Google, insecure, credential-bearing and non-embed URLs", () => {
    const urls = [
      "http://www.google.com/maps/embed?pb=abc",
      "javascript:alert(1)",
      "data:text/html,<iframe></iframe>",
      "https://evil.example/maps/embed?pb=abc",
      "https://www.google.com.evil.example/maps/embed?pb=abc",
      "https://www.google.com/maps?q=Jeddah&output=embed",
      "https://maps.google.com/maps?q=Jeddah",
      "https://www.google.com/maps/place/Jeddah",
      "https://maps.app.goo.gl/Nm3susZt7moV2Fo87",
      "https://user:pass@www.google.com/maps/embed?pb=abc",
      "https://www.google.com:8443/maps/embed?pb=abc",
      "https://www.google.com/not-maps/embed",
    ];

    for (const url of urls) {
      expect(normalizeGoogleMapsEmbedUrl(url)).toBeNull();
    }
  });

  it("returns null for empty, non-string and oversized values", () => {
    expect(normalizeGoogleMapsEmbedUrl(null)).toBeNull();
    expect(normalizeGoogleMapsEmbedUrl(undefined)).toBeNull();
    expect(normalizeGoogleMapsEmbedUrl(42)).toBeNull();
    expect(normalizeGoogleMapsEmbedUrl("")).toBeNull();
    expect(normalizeGoogleMapsEmbedUrl("   ")).toBeNull();
    expect(
      normalizeGoogleMapsEmbedUrl(
        `https://www.google.com/maps/embed?pb=${"x".repeat(GOOGLE_MAPS_EMBED_MAX_LENGTH)}`,
      ),
    ).toBeNull();
  });
});

describe("buildGoogleMapsSearchUrl", () => {
  it("builds a safe Google Maps search URL from the text address", () => {
    const href = buildGoogleMapsSearchUrl("Jeddah", "King Fahd Road");
    const url = new URL(href);

    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe("Jeddah, King Fahd Road");
  });
});
