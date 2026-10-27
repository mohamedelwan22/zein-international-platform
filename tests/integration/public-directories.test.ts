import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { listPublicLocations } from "@/server/services/locations";
import {
  listPublicClients,
  listPublicSuppliers,
  publicSupplierDetail,
} from "@/server/services/directory";

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
      mapEmbedUrl: "https://www.google.com/maps/embed?pb=jeddah",
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

  it("returns only validated Google Maps embed URLs", async () => {
    const admin = await ensureTestUser();
    const rows = await seedLocations(admin.id);

    const locations = await listPublicLocations("en");
    expect(locations.find((location) => location.city === "Jeddah")?.mapEmbedUrl).toBe(
      "https://www.google.com/maps/embed?pb=jeddah",
    );
    expect(locations.find((location) => location.city === "Riyadh")?.mapEmbedUrl).toBeNull();

    // A direct-database or legacy value outside Google's embed surface is
    // ignored on read, so it can never become an iframe src.
    await prisma.location.update({
      where: { id: rows.get("verifiedWithCoords")! },
      data: { mapEmbedUrl: "https://evil.example/maps/embed?pb=jeddah" },
    });
    const after = await listPublicLocations("en");
    expect(after.find((location) => location.city === "Jeddah")?.mapEmbedUrl).toBeNull();

    // A partial paste that omitted the opening `<iframe src="` still resolves
    // to the URL token; the trailing attributes are never rendered.
    await prisma.location.update({
      where: { id: rows.get("verifiedWithCoords")! },
      data: {
        mapEmbedUrl:
          'https://www.google.com/maps/embed?pb=partial" width="600" height="450" style="border:0;"',
      },
    });
    const recovered = await listPublicLocations("en");
    expect(recovered.find((location) => location.city === "Jeddah")?.mapEmbedUrl).toBe(
      "https://www.google.com/maps/embed?pb=partial",
    );
  });

  it("returns an empty list when nothing is verified (never a fabricated point)", async () => {
    const admin = await ensureTestUser();
    await seedLocations(admin.id);

    // Remove every verified row, leaving unverified/draft/inactive behind.
    await prisma.location.updateMany({ where: { isVerified: true }, data: { isVerified: false } });

    await expect(listPublicLocations("en")).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suppliers — disclosed AND published AND active (FR-011, data-model §2.5)
// ---------------------------------------------------------------------------

async function cleanSupplierRows() {
  await prisma.productCategory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.supplierCategory.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.supplier.deleteMany({});
}

beforeEach(async () => {
  await cleanSupplierRows();
});

describe("public supplier visibility — disclosed AND published AND active (FR-011)", () => {
  const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function seedSuppliers(createdById: string) {
    const seed = suffix();
    const baseline = [
      {
        key: "disclosedPublished",
        nameEn: "Al Noor Trading",
        nameAr: "النور التجارية",
        slugEn: `al-noor-${seed}`,
        slugAr: `al-noor-ar-${seed}`,
        summaryEn: "Importer of personal-care brands.",
        summaryAr: "مستورد علامات العناية الشخصية.",
        originCountryEn: "Saudi Arabia",
        originCountryAr: "المملكة العربية السعودية",
        disclosureApproved: true,
        status: "published" as const,
        isActive: true,
        sortOrder: 1,
      },
      {
        key: "undisclosedPublished",
        nameEn: "Hidden Partners Co",
        nameAr: "شركاء مخفيون",
        slugEn: `hidden-${seed}`,
        slugAr: `hidden-ar-${seed}`,
        disclosureApproved: false,
        status: "published" as const,
        isActive: true,
        sortOrder: 2,
      },
      {
        key: "disclosedDraft",
        nameEn: "Draft Supplier",
        nameAr: "مورد مسودة",
        slugEn: `draft-${seed}`,
        slugAr: `draft-ar-${seed}`,
        disclosureApproved: true,
        status: "draft" as const,
        isActive: true,
        sortOrder: 3,
      },
      {
        key: "disclosedInactive",
        nameEn: "Inactive Supplier",
        nameAr: "مورد غير نشط",
        slugEn: `inactive-${seed}`,
        slugAr: `inactive-ar-${seed}`,
        disclosureApproved: true,
        status: "published" as const,
        isActive: false,
        sortOrder: 4,
      },
    ];

    const rows = new Map<string, { id: string; slugEn: string; slugAr: string }>();
    for (const supplier of baseline) {
      const { key, ...data } = supplier;
      const row = await prisma.supplier.create({ data: { ...data, createdById } });
      rows.set(key, { id: row.id, slugEn: row.slugEn, slugAr: row.slugAr });
    }
    return rows;
  }

  it("lists only disclosed+published+active suppliers, ordered by sortOrder", async () => {
    const admin = await ensureTestUser();
    await seedSuppliers(admin.id);

    const suppliers = await listPublicSuppliers("en");

    expect(suppliers.map((supplier) => supplier.name)).toEqual(["Al Noor Trading"]);
  });

  it("resolves localized supplier fields per locale with T027 fallback", async () => {
    const admin = await ensureTestUser();
    await seedSuppliers(admin.id);

    const en = await listPublicSuppliers("en");
    expect(en[0]?.name).toBe("Al Noor Trading");
    expect(en[0]?.summary).toBe("Importer of personal-care brands.");
    expect(en[0]?.originCountry).toBe("Saudi Arabia");

    const ar = await listPublicSuppliers("ar");
    expect(ar[0]?.name).toBe("النور التجارية");
    expect(ar[0]?.summary).toBe("مستورد علامات العناية الشخصية.");
    expect(ar[0]?.originCountry).toBe("المملكة العربية السعودية");
  });

  it("never resolves a detail page for an undisclosed or unpublished supplier", async () => {
    const admin = await ensureTestUser();
    const rows = await seedSuppliers(admin.id);

    await expect(
      publicSupplierDetail("en", rows.get("disclosedPublished")!.slugEn),
    ).resolves.not.toBeNull();
    await expect(
      publicSupplierDetail("en", rows.get("undisclosedPublished")!.slugEn),
    ).resolves.toBeNull();
    await expect(
      publicSupplierDetail("en", rows.get("disclosedDraft")!.slugEn),
    ).resolves.toBeNull();
    await expect(
      publicSupplierDetail("en", rows.get("disclosedInactive")!.slugEn),
    ).resolves.toBeNull();
  });

  it("lists only the supplier's published+active products (no orphan public pages)", async () => {
    const admin = await ensureTestUser();
    const seed = suffix();
    const rows = await seedSuppliers(admin.id);
    const supplierId = rows.get("disclosedPublished")!.id;

    const brand = await prisma.brand.create({
      data: {
        nameEn: "Brand",
        nameAr: "علامة",
        slugEn: `brand-${seed}`,
        slugAr: `brand-ar-${seed}`,
        status: "published",
        isActive: true,
        createdById: admin.id,
      },
    });
    const category = await prisma.category.create({
      data: {
        kind: "product",
        nameEn: "Category",
        nameAr: "فئة",
        slugEn: `category-${seed}`,
        slugAr: `category-ar-${seed}`,
        status: "published",
        isActive: true,
        createdById: admin.id,
      },
    });

    const published = await prisma.product.create({
      data: {
        brandId: brand.id,
        supplierId,
        nameEn: "Published Product",
        nameAr: "منتج منشور",
        slugEn: `published-product-${seed}`,
        slugAr: `published-product-ar-${seed}`,
        status: "published",
        isActive: true,
        createdById: admin.id,
      },
    });
    await prisma.productCategory.create({
      data: { productId: published.id, categoryId: category.id },
    });

    await prisma.product.create({
      data: {
        brandId: brand.id,
        supplierId,
        nameEn: "Draft Product",
        nameAr: "منتج مسودة",
        slugEn: `draft-product-${seed}`,
        slugAr: `draft-product-ar-${seed}`,
        status: "draft",
        isActive: true,
        createdById: admin.id,
      },
    });

    const detail = await publicSupplierDetail(
      "en",
      rows.get("disclosedPublished")!.slugEn,
    );

    expect(detail?.products.map((product) => product.name)).toEqual([
      "Published Product",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Clients — disclosed AND published AND active (FR-012, data-model §2.6)
// ---------------------------------------------------------------------------

describe("public client visibility — approved references only (FR-012)", () => {
  async function seedClients(createdById: string) {
    const baseline = [
      {
        nameEn: "Acme Distribution",
        nameAr: "أكمي للتوزيع",
        industryEn: "Retail",
        industryAr: "التجزئة",
        locationEn: "Riyadh",
        locationAr: "الرياض",
        website: "https://acme.example",
        descriptionEn: "Regional retail partner.",
        descriptionAr: "شريك تجزئة إقليمي.",
        disclosureApproved: true,
        status: "published" as const,
        isActive: true,
        sortOrder: 1,
      },
      {
        nameEn: "Confidential Client",
        nameAr: "عميل سري",
        disclosureApproved: false,
        status: "published" as const,
        isActive: true,
        sortOrder: 2,
      },
      {
        nameEn: "Draft Client",
        nameAr: "عميل مسودة",
        disclosureApproved: true,
        status: "draft" as const,
        isActive: true,
        sortOrder: 3,
      },
      {
        nameEn: "Inactive Client",
        nameAr: "عميل غير نشط",
        disclosureApproved: true,
        status: "published" as const,
        isActive: false,
        sortOrder: 4,
      },
    ];

    for (const data of baseline) {
      await prisma.client.create({ data: { ...data, createdById } });
    }
  }

  it("lists only disclosed+published+active clients and only approved fields", async () => {
    const admin = await ensureTestUser();
    await seedClients(admin.id);

    const clients = await listPublicClients("en");

    expect(clients.map((client) => client.name)).toEqual(["Acme Distribution"]);
    expect(Object.keys(clients[0]!).sort()).toEqual([
      "description",
      "id",
      "industry",
      "location",
      "logoMediaId",
      "name",
      "website",
    ]);
  });

  it("resolves localized client fields per locale with T027 fallback", async () => {
    const admin = await ensureTestUser();
    await seedClients(admin.id);

    const ar = await listPublicClients("ar");
    expect(ar[0]?.name).toBe("أكمي للتوزيع");
    expect(ar[0]?.industry).toBe("التجزئة");
    expect(ar[0]?.location).toBe("الرياض");
  });

  it("returns an empty list when no client reference is approved", async () => {
    const admin = await ensureTestUser();
    await seedClients(admin.id);
    await prisma.client.updateMany({ data: { disclosureApproved: false } });

    await expect(listPublicClients("en")).resolves.toEqual([]);
  });
});
