/**
 * Map-provider adapter (T087, plan "Maps" row, Open Item 7).
 *
 * The public geographic-presence experience must not hard-wire a map vendor:
 * the provider is a client-confirmation item, so it is isolated behind this
 * neutral descriptor. `MAP_PROVIDER=osm` (the approved default) resolves to
 * OpenStreetMap tiles, which need no token. Providers that require a token
 * resolve to `tileUrl: null` until an approved tile URL/key is supplied, so
 * the page degrades to its text rendering instead of leaking a key or
 * inventing data.
 */

export type MapProviderId = "osm" | "google" | "mapbox";

export interface MapProviderConfig {
  id: MapProviderId;
  /** Raster tile template, or null when no approved tile source exists yet. */
  tileUrl: string | null;
  /** Tile attribution HTML (required by the tile source). */
  attribution: string;
  /** Provider token/key — empty for token-less providers (OSM). */
  token: string;
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Narrow an arbitrary env string to a known provider id, defaulting to OSM. */
export function normalizeMapProvider(provider: string | undefined): MapProviderId {
  return provider === "google" || provider === "mapbox" ? provider : "osm";
}

export function resolveMapProvider(
  provider: string | undefined,
  token: string | undefined,
): MapProviderConfig {
  const id = normalizeMapProvider(provider);

  if (id === "osm") {
    return { id, tileUrl: OSM_TILE_URL, attribution: OSM_ATTRIBUTION, token: "" };
  }

  // Google/Mapbox are wired only once an approved token + tile URL exist
  // (Open Item 7). Until then there is no tile source to render.
  return { id, tileUrl: null, attribution: OSM_ATTRIBUTION, token: token ?? "" };
}

/** A mappable point: a verified location that carries finite coordinates. */
export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
}
