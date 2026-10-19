"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { PublicLocation } from "@/server/services/locations";
import { MapSection } from "./map-section";
import type { MapPoint } from "./map-provider";

/**
 * Interactive geographic-presence explorer (T087, FR-013, US8).
 *
 * Pairs the labelled map with the authoritative text list of verified
 * locations. Only locations that carry real coordinates appear as pins; every
 * verified location (with or without coordinates) renders as an accessible
 * card. Selecting a card highlights its pin; clicking a pin selects its card's
 * state. The list alone is fully usable without the map, and selecting around
 * it never loses information — a purely presentational enhancement over the
 * already-accessible list.
 */

export interface LocationExplorerProps {
  locations: PublicLocation[];
  /** Provider id + token resolved on the server from MAP_PROVIDER/MAP_TOKEN. */
  provider?: string;
  token?: string;
  mapAriaLabel: string;
}

function hasCoordinates(
  location: PublicLocation,
): location is PublicLocation & { latitude: number; longitude: number } {
  return location.latitude !== null && location.longitude !== null;
}

export function LocationExplorer({
  locations,
  provider,
  token,
  mapAriaLabel,
}: LocationExplorerProps) {
  const t = useTranslations("geography");
  const tCommon = useTranslations("common");

  const pinnable = useMemo(() => locations.filter(hasCoordinates), [locations]);
  const points = useMemo<MapPoint[]>(
    () =>
      pinnable.map((location) => ({
        id: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        label: location.city,
      })),
    [pinnable],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    () => pinnable[0]?.id ?? null,
  );

  const selected = pinnable.find((location) => location.id === selectedId) ?? null;
  const hasMap = points.length > 0;

  return (
    <div className="flex flex-col gap-10">
      {hasMap ? (
        <div className="flex flex-col gap-3">
          <MapSection
            points={points}
            provider={provider}
            token={token}
            ariaLabel={mapAriaLabel}
            selectedId={selectedId}
            onSelect={setSelectedId}
            className="h-80 w-full overflow-hidden rounded-lg border border-zain-green-950/10 md:h-[28rem]"
          />
          <p className="text-meta text-zain-green-950/70">{t("mapInstruction")}</p>
          <p role="status" className="sr-only">
            {selected ? t("showingOnMap", { name: selected.city }) : ""}
          </p>
        </div>
      ) : null}

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((location) => {
          const isPinnable = hasCoordinates(location);
          const isSelected = isPinnable && location.id === selectedId;

          return (
            <li
              key={location.id}
              className={`flex h-full flex-col rounded-lg border bg-zain-cream-50 p-8 transition-shadow ${
                isSelected
                  ? "border-zain-gold-500 ring-2 ring-zain-gold-500/40"
                  : "border-zain-green-950/10"
              }`}
            >
              <h3 className="font-display text-h3 font-medium text-zain-green-950">
                {location.city}
              </h3>
              <address className="mt-3 space-y-1 text-body not-italic text-zain-green-950/80">
                {location.region ? <p>{location.region}</p> : null}
                <p>{location.address}</p>
                {location.countryCode ? <p dir="ltr">{location.countryCode}</p> : null}
              </address>

              {location.coverage ? (
                <p className="mt-4 text-body text-zain-green-950/70">
                  {location.coverage}
                </p>
              ) : null}

              {location.phone || location.email || location.mapUrl ? (
                <div className="mt-4 flex flex-col gap-1">
                  {location.phone ? (
                    <a
                      href={`tel:${location.phone}`}
                      dir="ltr"
                      className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                    >
                      {location.phone}
                    </a>
                  ) : null}
                  {location.email ? (
                    <a
                      href={`mailto:${location.email}`}
                      className="inline-flex min-h-11 items-center text-body text-zain-green-950/85 underline-offset-4 hover:text-zain-green-700 hover:underline"
                    >
                      {location.email}
                    </a>
                  ) : null}
                  {location.mapUrl ? (
                    <a
                      href={location.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
                    >
                      {tCommon("seeMore")}
                    </a>
                  ) : null}
                </div>
              ) : null}

              {isPinnable ? (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(location.id)}
                  className="mt-4 inline-flex min-h-11 items-center self-start text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
                >
                  {t("viewOnMap")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
