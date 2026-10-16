import { describe, expect, it } from "vitest";
import {
  normalizeMapProvider,
  resolveMapProvider,
} from "@/components/geography/map-provider";

/**
 * T087 — provider-neutral map adapter (unit).
 *
 * The map vendor is a client-confirmation item (Open Item 7), so the adapter
 * must: default to OSM, isolate unknown values, expose an OSM tile source
 * without a token, and refuse to fabricate a tile source for token providers
 * that have no approved URL yet.
 */

describe("normalizeMapProvider", () => {
  it("keeps known providers", () => {
    expect(normalizeMapProvider("osm")).toBe("osm");
    expect(normalizeMapProvider("google")).toBe("google");
    expect(normalizeMapProvider("mapbox")).toBe("mapbox");
  });

  it("defaults unknown or missing values to osm", () => {
    expect(normalizeMapProvider(undefined)).toBe("osm");
    expect(normalizeMapProvider("bing")).toBe("osm");
    expect(normalizeMapProvider("")).toBe("osm");
  });
});

describe("resolveMapProvider", () => {
  it("exposes the OSM tile source with no token", () => {
    const config = resolveMapProvider("osm", "");
    expect(config.id).toBe("osm");
    expect(config.tileUrl).toContain("openstreetmap.org");
    expect(config.token).toBe("");
    expect(config.attribution).toContain("OpenStreetMap");
  });

  it("defaults to OSM when the provider is unset", () => {
    const config = resolveMapProvider(undefined, undefined);
    expect(config.id).toBe("osm");
    expect(config.tileUrl).not.toBeNull();
  });

  it("does not fabricate a tile source for token providers without an approved URL", () => {
    const google = resolveMapProvider("google", "test-key");
    expect(google.id).toBe("google");
    expect(google.tileUrl).toBeNull();
    expect(google.token).toBe("test-key");

    const mapbox = resolveMapProvider("mapbox", undefined);
    expect(mapbox.id).toBe("mapbox");
    expect(mapbox.tileUrl).toBeNull();
    expect(mapbox.token).toBe("");
  });
});
