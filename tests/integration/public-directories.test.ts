import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { listPublicLocations } from "@/server/services/locations";

/**
 * T083 [US8] — public geographic-presence reads (integration).
 *
 * Drives the T087 service contract in `src/server/services/locations.ts`:
 *   listPublicLocations(locale) -> PublicLocation[]
 *
 * Verifies, against a real database, the data-model §2.7 render rule (FR-013):
 * - a location surfaces publicly ONLY when `isVerified = true AND status =
 *   'published' AND isActive = true` — unverified, draft, and inactive rows
 *   never appear;
 * - coordinates are optional and never invented: a verified location without
 *   latitude/longitude is returned with nulls (text-address rendering), and
 *   only locations that carry coordinates are map-pin eligible;
 * - localized city/address/coverage resolve per locale, with the shared T027
 *   fallback when one locale is missing;
 * - with zero verified locations the read returns an empty list (never a
 *   fabricated point), so the page can render the approved wording + empty state.
 */

const TEST_ADMIN = {
  email: "directories-test-admin@zainagency.test",
  name: "Directories Test Admin",
  passwordHash: "not-a-real-hash-integration-fixture",
  role: "SuperAdmin" as const,
};

async function ensureTestUser() {
  return prisma.user.upsert({
    where: { email: TEST_ADMIN.email },
    create: TEST_ADMIN,
    update: {},
  });
}

async function seedLocations(createdById: string) {
  const baseline = [
    {
      key: "verifiedWithCoords",
      cityEn: "Jeddah",
      cityAr: "جدة",
      addressEn: "23337 King Fahd Road, Al Aziziyah District",
      addressAr: "٢٣٣٣٧ طريق الملك فهد، حي العزيزية",
      region: "Makkah",
      countryCode: "SA",
      latitude: 21.485811,
      longitude: 39.192505,
      coverageEn: "Western region distribution hub.",
      coverageAr: "مركز التوزيع في المنطقة الغربية.",
      isVerified: true,
      status: "published" as const,
      isActive: true,
      sortOrder: 1,
    },
    {
      key: "verifiedNoCoords",
      cityEn: "Riyadh",
      cityAr: "الرياض",
      addressEn: "King Fahd Road, Riyadh",
      addressAr: "طريق الملك فهد، الرياض",
      region: null,
      countryCode: "SA",
      latitude: null,
      longitude: null,
      coverageEn: null,
      coverageAr: null,
      isVerified: true,
      status: "published" as const,
      isActive: true,
      sortOrder: 2,
    },
    {
      key: "unverified",
      cityEn: "Dammam",
      cityAr: "الدمام",
      addressEn: "King Saud Road, Dammam",
      addressAr: "طريق الملك سعود، الدمام",
      region: null,
      countryCode: "SA",
      latitude: 26.4207,
      longitude: 50.0888,
      isVerified: false,
      status: "published" as const,
      isActive: true,
      sortOrder: 3,
    },
    {
      key: "draftVerified",
      cityEn: "Mecca",
      cityAr: "مكة",
      addressEn: "Ibrahim Al Khalil Road, Mecca",
      addressAr: "طريق إبراهيم الخليل، مكة",
      region: null,
      countryCode: "SA",
      latitude: 21.3891,
      longitude: 39.8579,
      isVerified: true,
      status: "draft" as const,
      isActive: true,
      sortOrder: 4,
    },
    {
      key: "inactiveVerified",
      cityEn: "Medina",
      cityAr: "المدينة",
      addressEn: "King Abdullah Road, Medina",
      addressAr: "طريق الملك عبدالله، المدينة",
      region: null,
      countryCode: "SA",
      latitude: 24.5247,
      longitude: 39.5692,
      isVerified: true,
      status: "published" as const,
      isActive: false,
      sortOrder: 5,
    },
  ];

  const rows = new Map<string, string>();
  for (const location of baseline) {
    const { key, ...data } = location;
    const row = await prisma.location.create({
      data: { ...data, createdById },
    });
    rows.set(key, row.id);
  }
  return rows;
}

beforeEach(async () => {
  await prisma.location.deleteMany({});
});

describe("public location visibility — verified AND published AND active (FR-013)", () => {
  it("lists only verified+published+active locations, ordered by sortOrder", async () => {
    const admin = await ensureTestUser();
    await seedLocations(admin.id);

    const locations = await listPublicLocations("en");

    expect(locations.map((location) => location.city)).toEqual(["Jeddah", "Riyadh"]);
  });

  it("resolves localized city/address/coverage per locale with T027 fallback", async () => {
    const admin = await ensureTestUser();
    await seedLocations(admin.id);

    const en = await listPublicLocations("en");
    expect(en[0]?.city).toBe("Jeddah");
    expect(en[0]?.address).toBe("23337 King Fahd Road, Al Aziziyah District");
    expect(en[0]?.coverage).toBe("Western region distribution hub.");

    const ar = await listPublicLocations("ar");
    expect(ar[0]?.city).toBe("جدة");
    expect(ar[0]?.address).toBe("٢٣٣٣٧ طريق الملك فهد، حي العزيزية");
    expect(ar[0]?.coverage).toBe("مركز التوزيع في المنطقة الغربية.");
  });

  it("keeps coordinates optional and never invents them", async () => {
    const admin = await ensureTestUser();
    await seedLocations(admin.id);

    const locations = await listPublicLocations("en");
    const jeddah = locations.find((location) => location.city === "Jeddah");
    const riyadh = locations.find((location) => location.city === "Riyadh");

    expect(jeddah?.latitude).toBeCloseTo(21.485811, 6);
    expect(jeddah?.longitude).toBeCloseTo(39.192505, 6);
    expect(riyadh?.latitude).toBeNull();
    expect(riyadh?.longitude).toBeNull();

    // Only coordinate-bearing verified locations are map-pin eligible.
    const pinnable = locations.filter(
      (location) => location.latitude !== null && location.longitude !== null,
    );
    expect(pinnable.map((location) => location.city)).toEqual(["Jeddah"]);
  });

  it("returns an empty list when nothing is verified (never a fabricated point)", async () => {
    const admin = await ensureTestUser();
    await seedLocations(admin.id);

    // Remove every verified row, leaving unverified/draft/inactive behind.
    await prisma.location.updateMany({ where: { isVerified: true }, data: { isVerified: false } });

    await expect(listPublicLocations("en")).resolves.toEqual([]);
  });
});
