"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { resolveMapProvider, type MapPoint } from "./map-provider";

/**
 * Provider-neutral map surface (T087). A thin client shell that mounts the
 * Leaflet runtime only in the browser (dynamic import inside `useEffect`), so
 * no map library code runs during SSR/prerender and no vendor key is bundled.
 * Points are drawn as `circleMarker`s — no icon image assets are needed.
 *
 * The accessible, authoritative rendering of every location is the text list
 * the page renders around this map; the map itself is a labelled visual aid.
 * Renders nothing when there are no coordinates (FR-013 text fallback).
 */

export interface MapSectionProps {
  points: MapPoint[];
  /** Provider id + token resolved on the server from MAP_PROVIDER/MAP_TOKEN. */
  provider?: string;
  token?: string;
  /** Accessible name for the map region. */
  ariaLabel: string;
  className?: string;
}

const PIN_STYLE = {
  radius: 8,
  weight: 2,
  color: "#ffffff",
  fillColor: "#0b5d3b",
  fillOpacity: 1,
} as const;

export function MapSection({ points, provider, token, ariaLabel, className }: MapSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const config = resolveMapProvider(provider, token);
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      // StrictMode/unmount or a newer run may have superseded this effect.
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { scrollWheelZoom: false });

      if (config.tileUrl) {
        L.tileLayer(config.tileUrl, {
          attribution: config.attribution,
          maxZoom: 19,
        }).addTo(map);
      }

      const latLngs: [number, number][] = points.map((point) => [
        point.latitude,
        point.longitude,
      ]);

      for (const point of points) {
        L.circleMarker([point.latitude, point.longitude], PIN_STYLE)
          .addTo(map)
          .bindTooltip(point.label);
      }

      if (latLngs.length === 1) {
        map.setView(latLngs[0], 11);
      } else {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [points, provider, token]);

  if (points.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
    />
  );
}
