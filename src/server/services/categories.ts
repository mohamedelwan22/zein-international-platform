import { prisma } from "@/server/db/prisma";
import { pickLocalized } from "@/i18n/localized";
import type { AppLocale } from "@/i18n/routing";

/**
 * Dynamic category reads (T044, FR-027) — shared by the nav, catalog filters,
 * and the Home category preview. Categories are fully dynamic: every list is
 * a database read against the publication predicate; nothing is hardcoded.
 */

export interface PublishedCategoryPreview {
  id: string;
  kind: "brand" | "product" | "supplier";
  name: string;
  slug: string;
  description: string | null;
}

export interface ListPublishedCategoriesOptions {
  /** Category kind — defaults to product (the seeded approved set). */
  kind?: "brand" | "product" | "supplier";
  /** Maximum number of categories (previews pass a small cap). */
  take?: number;
}

export async function listPublishedCategories(
  locale: AppLocale,
  options: ListPublishedCategoriesOptions = {},
): Promise<PublishedCategoryPreview[]> {
  const kind = options.kind ?? "product";

  const rows = await prisma.category.findMany({
    where: { kind, status: "published", isActive: true },
    orderBy: { sortOrder: "asc" },
    take: options.take,
    select: {
      id: true,
      kind: true,
      nameEn: true,
      nameAr: true,
      slugEn: true,
      slugAr: true,
      descriptionEn: true,
      descriptionAr: true,
    },
  });

  return rows.flatMap((row) => {
    // Spec edge case: fall back to the available approved variant; an
    // optional description hides when neither locale has one.
    const name = pickLocalized(locale, { en: row.nameEn, ar: row.nameAr });
    const slug = pickLocalized(locale, { en: row.slugEn, ar: row.slugAr });
    const description = pickLocalized(locale, {
      en: row.descriptionEn,
      ar: row.descriptionAr,
    });
    if (!name || !slug) return [];

    return [
      {
        id: row.id,
        kind: row.kind,
        name: name.text,
        slug: slug.text,
        description: description?.text ?? null,
      },
    ];
  });
}
