import { prisma } from "@/server/db/prisma";
import { pickLocalized } from "@/i18n/localized";
import type { AppLocale } from "@/i18n/routing";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Public geographic-presence reads (T087, FR-013, US8).
 *
 * A location is publicly visible ONLY when it is verified AND published
 * (data-model §2.7 render rule): `isVerified = true AND status = 'published'
 * AND isActive = true`. Coordinates are optional and never invented — a
 * verified location without latitude/longitude renders as a text address, and
 * only locations WITH coordinates become map pins (FR-013 edge cases).
 */

const PUBLISHED = "published" as const;

export interface PublicLocation {
  id: string;
  city: string;
  address: string;
  region: string | null;
  countryCode: string | null;
  /** Present only when the staff-entered decimal is a finite number. */
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  mapUrl: string | null;
  imageMediaId: string | null;
  locationType: string | null;
  /** Approved per-location coverage description (FR-030), when set. */
  coverage: string | null;
}

const locationColumns = {
  id: true,
  cityEn: true,
  cityAr: true,
  addressEn: true,
  addressAr: true,
  region: true,
  countryCode: true,
  latitude: true,
  longitude: true,
  phone: true,
  email: true,
  mapUrl: true,
  imageMediaId: true,
  locationType: true,
  coverageEn: true,
  coverageAr: true,
} satisfies Prisma.LocationSelect;

type LocationRow = Prisma.LocationGetPayload<{ select: typeof locationColumns }>;

/** Prisma `Decimal | null` → finite number, or null when absent/invalid. */
function toCoordinate(value: Prisma.Decimal | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapLocation(locale: AppLocale, row: LocationRow): PublicLocation | null {
  const city = pickLocalized(locale, { en: row.cityEn, ar: row.cityAr });
  const address = pickLocalized(locale, { en: row.addressEn, ar: row.addressAr });
  if (!city || !address) return null;

  const coverage = pickLocalized(locale, {
    en: row.coverageEn,
    ar: row.coverageAr,
  });

  return {
    id: row.id,
    city: city.text,
    address: address.text,
    region: row.region,
    countryCode: row.countryCode,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    phone: row.phone,
    email: row.email,
    mapUrl: row.mapUrl,
    imageMediaId: row.imageMediaId,
    locationType: row.locationType,
    coverage: coverage?.text ?? null,
  };
}

/**
 * Verified + published + active locations, ordered by `sortOrder`. Returns an
 * empty array (never a fabricated point) when nothing has been verified yet,
 * so the caller can render the approved coverage wording and the empty state.
 */
export async function listPublicLocations(locale: AppLocale): Promise<PublicLocation[]> {
  const rows = await prisma.location.findMany({
    where: { isVerified: true, status: PUBLISHED, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: locationColumns,
  });

  return rows.flatMap((row) => {
    const mapped = mapLocation(locale, row);
    return mapped ? [mapped] : [];
  });
}
