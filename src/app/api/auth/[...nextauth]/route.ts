import { handlers } from "@/server/auth/auth";

/**
 * T048 [US3] — Auth.js v5 route handler (contracts/admin-api.md §1).
 *
 * Wires the exported NextAuth handlers so the Credentials provider serves
 * `GET/POST /api/auth/*` (sign-in, sign-out, session, CSRF). These endpoints
 * are public by design; authorization is enforced per privileged operation
 * by `requirePermission` (FR-022).
 */
export const { GET, POST } = handlers;
