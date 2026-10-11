import { prisma } from "@/server/db/prisma";
import type { AppLocale } from "@/i18n/routing";
import type { EntityType } from "@/generated/prisma/client";

/**
 * Slug redirect resolution (T041, data-model §2.11 / US10.3 behavior).
 *
 * A `SlugRedirect` row is written whenever an entity slug changes (US10.3) so
 * old public URLs keep resolving; the HTTP layer eventually answers 301. This
 * module is the shared READ side: it follows the redirect chain to the entity's
 * canonical slug.
 *
 * Chain guard (data-model §2.11): if the requested slug is already owned by a
 * live entity, it ALWAYS wins — a stale redirect can never shadow a real slug.
 * The caller supplies `exists` because only the owning domain knows how to
 * check "is this slug taken by an entity" (brand vs product vs page).
 */

/** Bounded walk so a malformed redirect cycle can never loop forever. */
const MAX_HOPS = 10;

export interface ResolveSlugRedirectInput {
  /** Entity namespace — same members as `SlugRedirect.entityType`. */
  entityType: EntityType;
  locale: AppLocale;
  /** The slug from the incoming URL (may be stale). */
  slug: string;
  /** True when `slug` is currently owned by a live entity of `entityType`. */
  exists: (slug: string) => Promise<boolean>;
}

/**
 * Resolve an incoming slug to the canonical slug, honoring `SlugRedirect`.
 * Returns the input unchanged when no redirect applies (or the slug is live).
 */
export async function resolveSlugRedirect({
  entityType,
  locale,
  slug,
  exists,
}: ResolveSlugRedirectInput): Promise<string> {
  let current = slug;
  const visited = new Set<string>([current]);

  for (let hops = 0; hops < MAX_HOPS; hops += 1) {
    // Chain guard: a live entity slug always wins over a stale redirect.
    if (await exists(current)) return current;

    const redirect = await prisma.slugRedirect.findUnique({
      where: {
        entityType_oldSlug_locale: { entityType, locale, oldSlug: current },
      },
      select: { newSlug: true },
    });

    if (!redirect) return current;
    if (visited.has(redirect.newSlug)) return current;

    visited.add(redirect.newSlug);
    current = redirect.newSlug;
  }

  return current;
}
