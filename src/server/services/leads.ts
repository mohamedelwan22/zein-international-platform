import { prisma } from "@/server/db/prisma";
import { badRequest } from "@/server/http/errors";
import type { LeadStatus } from "@/generated/prisma/client";

/**
 * Shared lead-pipeline helpers (T063, Clarification 3, admin-api.md §4).
 *
 * Inquiries and partnership requests are two faces of one pipeline: both enter
 * at `new`, both move through the same documented statuses, and both attach
 * contextual catalog FKs only when the referenced entity is published +
 * active right now. Keeping the transition graph and the context resolution in
 * one module guarantees the two flows can never drift apart.
 */

/** Forward transitions plus the documented `closed → contacted` reopen. */
export const ALLOWED_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacted", "inProgress", "closed"],
  contacted: ["inProgress", "closed"],
  inProgress: ["closed"],
  closed: ["contacted"],
};

/**
 * Reject a status move the shared pipeline does not allow (contract `400`).
 * The issue key is a `validation.*` message key, never a user-facing string.
 */
export function assertCanTransition(from: LeadStatus, to: LeadStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw badRequest("Invalid status transition", [
      { path: "status", issue: "invalidType" },
    ]);
  }
}

export interface LeadContextIds {
  productId: string | null;
  brandId: string | null;
  supplierId: string | null;
}

export interface LeadContextInput {
  productId?: string | null;
  brandId?: string | null;
  supplierId?: string | null;
}

/**
 * Attach context only for entities that are published + active right now, so a
 * stale or unpublished id is silently dropped — never a publication oracle.
 */
export async function resolvePublishedContext(
  input: LeadContextInput,
): Promise<LeadContextIds> {
  const [product, brand, supplier] = await Promise.all([
    input.productId
      ? prisma.product.findFirst({
          where: { id: input.productId, status: "published", isActive: true },
          select: { id: true },
        })
      : null,
    input.brandId
      ? prisma.brand.findFirst({
          where: { id: input.brandId, status: "published", isActive: true },
          select: { id: true },
        })
      : null,
    input.supplierId
      ? prisma.supplier.findFirst({
          where: { id: input.supplierId, status: "published", isActive: true },
          select: { id: true },
        })
      : null,
  ]);

  return {
    productId: product?.id ?? null,
    brandId: brand?.id ?? null,
    supplierId: supplier?.id ?? null,
  };
}
