/**
 * Mutation Origin guard (T110 — plan.md Security Strategy: "CSRF protection
 * via Auth.js + Origin checks on mutations").
 *
 * Auth.js issues SameSite=Lax httpOnly session cookies and validates its own
 * CSRF token for the credential callback. This guard is the second,
 * route-independent layer: every state-changing API request (POST/PUT/PATCH/
 * DELETE) must either omit Origin (non-browser clients: curl, CI probes,
 * server-to-server) or present an Origin whose host matches the host the
 * request was addressed to. `Origin: null` (sandboxed iframe / file://) and
 * `Sec-Fetch-Site: cross-site` are always rejected.
 *
 * The function is pure so the decision table is unit-tested without HTTP.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface MutationOriginInput {
  method: string;
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
  siteUrl?: string | null;
  fetchSite?: string | null;
}

export type MutationOriginDecision =
  | { allowed: true; reason: "safe-method" | "no-origin" | "same-origin" }
  | { allowed: false; reason: "cross-site-fetch" | "null-origin" | "foreign-origin" | "unparsable-origin" };

function hostOf(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const first = value.split(",")[0]?.trim() ?? "";
  if (!first) {
    return null;
  }
  try {
    return new URL(first.includes("://") ? first : `http://${first}`).host.toLowerCase();
  } catch {
    return null;
  }
}

export function evaluateMutationOrigin(input: MutationOriginInput): MutationOriginDecision {
  if (SAFE_METHODS.has(input.method.toUpperCase())) {
    return { allowed: true, reason: "safe-method" };
  }

  if ((input.fetchSite ?? "").toLowerCase() === "cross-site") {
    return { allowed: false, reason: "cross-site-fetch" };
  }

  const rawOrigin = input.origin?.trim() ?? "";
  if (!rawOrigin) {
    return { allowed: true, reason: "no-origin" };
  }
  if (rawOrigin.toLowerCase() === "null") {
    return { allowed: false, reason: "null-origin" };
  }

  let originHost: string;
  try {
    originHost = new URL(rawOrigin).host.toLowerCase();
  } catch {
    return { allowed: false, reason: "unparsable-origin" };
  }

  const allowedHosts = new Set(
    [hostOf(input.host), hostOf(input.forwardedHost), hostOf(input.siteUrl)].filter(
      (value): value is string => value !== null,
    ),
  );

  if (allowedHosts.has(originHost)) {
    return { allowed: true, reason: "same-origin" };
  }
  return { allowed: false, reason: "foreign-origin" };
}
