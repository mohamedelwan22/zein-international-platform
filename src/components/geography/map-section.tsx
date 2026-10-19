"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { resolveMapProvider, type MapPoint } from "./map-provider";

/**
 * Provider-neutral map surface (T087, FR-013). A thin client shell that mounts
 * the Leaflet runtime only in the browser (dynamic import inside `useEffect`),
 * so no map library code runs during SSR/prerender and no vendor key is
 * bundled. Points are drawn as `circleMarker`s — no icon image assets needed.
 *
 * When a `selectedId` is supplied the matching pin is restyled (gold + larger)
 * and — only on a user-driven change — the map eases to it (respecting
 * `prefers-reduced-motion`). The accessible, authoritative rendering of every
 * location is the text list the page renders around this map; the map itself
 * is a labelled visual aid. Renders nothing when there are no coordinates
 * (FR-013 text fallback).
 */

export interface MapSectionProps {
  points: MapPoint[];
  /** Provider id + token resolved on the server from MAP_PROVIDER/MAP_TOKEN. */
  provider?: string;
  token?: string;
  /** Accessible name for the map region. */
  ariaLabel: string;
  className?: string;
  /** Id of the point to highlight, or null for none. */
  selectedId?: string | null;
  /** Called when a pin is clicked. */
  onSelect?: (id: string) => void;
}

const PIN_STYLE = {
  radius: 8,
  weight: 2,
  color: "#ffffff",
  fillColor: "#0b5d3b",
  fillOpacity: 1,
} as const;

const SELECTED_PIN_STYLE = {
  radius: 11,
  weight: 3,
  color: "#ffffff",
  fillColor: "#c9a45c",
  fillOpacity: 1,
} as const;

function pointPosition(point: MapPoint): [number, number] {
  return [point.latitude, point.longitude];
}

function styleMarkers(
  markers: Map<string, CircleMarker>,
  selectedId: string | null,
): void {
  for (const [id, marker] of markers) {
    const selected = id === selectedId;
    marker.setStyle(selected ? SELECTED_PIN_STYLE : PIN_STYLE);
    if (selected) marker.bringToFront();
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function MapSection({
  points,
  provider,
  token,
  ariaLabel,
  className,
  selectedId = null,
  onSelect,
}: MapSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef<string | null>(selectedId);
  const lastSelectedRef = useRef<string | null>(null);

  // Keep the latest callback/selection visible to the mount effect without
  // forcing it to re-run (which would tear the map down on every render).
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const config = resolveMapProvider(provider, token);
    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      // StrictMode/unmount or a newer run may have superseded this effect.
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      mapRef.current = map;

      if (config.tileUrl) {
        L.tileLayer(config.tileUrl, {
          attribution: config.attribution,
          maxZoom: 19,
        }).addTo(map);
      }

      const markers = new Map<string, CircleMarker>();
      for (const point of points) {
        const marker = L.circleMarker(pointPosition(point), PIN_STYLE)
          .addTo(map)
          .bindTooltip(point.label);
        marker.on("click", () => onSelectRef.current?.(point.id));
        markers.set(point.id, marker);
      }
      markersRef.current = markers;
      // `setStyle` needs the marker projected, which only happens once the map
      // is ready; styling too early throws (Leaflet `_updateBounds` on an
      // unprojected marker). `whenReady` also fires immediately when the map
      // is already loaded, so a user-driven re-selection stays responsive.
      map.whenReady(() => {
        styleMarkers(markersRef.current, selectedIdRef.current);
      });

      const latLngs = points.map(pointPosition);
      if (latLngs.length === 1) {
        map.setView(latLngs[0], 11);
      } else {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
      }
    })();

    return () => {
      cancelled = true;
      markersRef.current.clear();
      const map = mapRef.current;
      mapRef.current = null;
      lastSelectedRef.current = null;
      map?.remove();
    };
  }, [points, provider, token]);

  // Highlight the selected pin, and ease to it only when the user changes the
  // selection (never on the initial render, which keeps the full overview).
  useEffect(() => {
    const markers = markersRef.current;
    if (markers.size === 0) return;

    styleMarkers(markers, selectedId);

    const map = mapRef.current;
    const selectedPoint = points.find((point) => point.id === selectedId);
    const previous = lastSelectedRef.current;
    lastSelectedRef.current = selectedId;

    if (map && selectedPoint && previous !== null && previous !== selectedId) {
      const target = pointPosition(selectedPoint);
      const zoom = Math.max(map.getZoom(), 11);
      if (prefersReducedMotion()) {
        map.setView(target, zoom);
      } else {
        map.flyTo(target, zoom, { duration: 0.6 });
      }
    }
  }, [selectedId, points]);

  if (points.length === 0) return null;

  return (
    <div ref={containerRef} role="img" aria-label={ariaLabel} className={className} />
  );
}
