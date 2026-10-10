/**
 * Idempotent seed — APPROVED PROFILE CONTENT ONLY (SC-010, Constitution III).
 * All copy lives in prisma/seed-content.ts with a sourceDoc reference per row.
 *
 * Idempotency: every row is created only if missing (upsert with empty
 * update). Staff edits made through the admin/CMS are never overwritten by
 * a re-run; rows are never duplicated.
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  ABOUT_CONTENT_AR,
  ABOUT_CONTENT_EN,
  CONTACT_INFO_AR,
  CONTACT_INFO_EN,
  HOME_CONTENT_AR,
  HOME_CONTENT_EN,
  SEED_CATEGORIES,
  SOURCE_DOCS,
} from "./seed-content.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Seed: DATABASE_URL is not set (see .env.example).");
  process.exit(1);
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ADMIN_EMAIL)) {
  console.error("Seed: ADMIN_EMAIL is missing or invalid (see .env.example).");
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12) {
  console.error("Seed: ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedBootstrapAdmin(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    // Never overwrite staff-managed accounts (password included) on re-runs.
    return existing.id;
  }
  const passwordHash = await hash(ADMIN_PASSWORD);
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, name: "Super Admin", passwordHash, role: "SuperAdmin" },
  });
  console.log(`  seed: created bootstrap admin ${ADMIN_EMAIL} (SuperAdmin)`);
  return admin.id;
}

async function seedCategories(adminId: string) {
  for (const category of SEED_CATEGORIES) {
    await prisma.category.upsert({
      where: {
        kind_slugEn: { kind: "product", slugEn: category.slugEn },
      },
      create: {
        kind: "product",
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        slugEn: category.slugEn,
        slugAr: category.slugAr,
        descriptionEn: category.descriptionEn,
        descriptionAr: category.descriptionAr,
        sourceDoc: category.sourceDoc,
        status: "published",
        isActive: true,
        sortOrder: category.sortOrder,
        createdById: adminId,
      },
      update: {},
    });
  }
  console.log(`  seed: ensured ${SEED_CATEGORIES.length} approved categories (kind=product)`);
}

async function seedSettings() {
  await prisma.settings.upsert({
    where: { key: "contact_info" },
    create: {
      key: "contact_info",
      valueEn: CONTACT_INFO_EN,
      valueAr: CONTACT_INFO_AR,
      sourceDoc: SOURCE_DOCS.contact,
    },
    update: {},
  });
  console.log("  seed: ensured Settings.contact_info (approved contact details)");
}

async function seedCmsSections(adminId: string) {
  const sections = [
    {
      sectionKey: "home" as const,
      en: HOME_CONTENT_EN,
      ar: HOME_CONTENT_AR,
      sourceDocEn: SOURCE_DOCS.homeEn,
      sourceDocAr: SOURCE_DOCS.homeAr,
    },
    {
      sectionKey: "about" as const,
      en: ABOUT_CONTENT_EN,
      ar: ABOUT_CONTENT_AR,
      sourceDocEn: SOURCE_DOCS.aboutEn,
      sourceDocAr: SOURCE_DOCS.aboutAr,
    },
  ];
  for (const section of sections) {
    for (const locale of ["en", "ar"] as const) {
      const content = locale === "en" ? section.en : section.ar;
      const sourceDoc = locale === "en" ? section.sourceDocEn : section.sourceDocAr;
      await prisma.cmsSection.upsert({
        where: {
          sectionKey_locale: { sectionKey: section.sectionKey, locale },
        },
        create: {
          sectionKey: section.sectionKey,
          locale,
          draftContent: content,
          publishedContent: content,
          sourceDoc,
          publishedAt: new Date(),
          createdById: adminId,
        },
        update: {},
      });
    }
  }
  console.log(
    `  seed: ensured CMS sections ${sections.map((s) => s.sectionKey).join(", ")} (en+ar, published)`,
  );
}

async function main() {
  console.log("Seed: loading approved profile content (idempotent, create-if-missing)…");
  const adminId = await seedBootstrapAdmin();
  await seedCategories(adminId);
  await seedSettings();
  await seedCmsSections(adminId);
  console.log("Seed: done.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
