import { recordLogout } from "@/server/services/activity";

/**
 * Sign-out audit adapter (T106/T109, US11, FR-035, SC-012).
 *
 * Auth.js emits `events.signOut` with the session token (JWT strategy) or the
 * session row (database strategy). The token is identity-only and carries the
 * staff id in the `uid` claim (see `auth.ts`), so the sign-out can be written
 * to the append-only activity log — the log records who ended a session, with
 * actor, action, target and timestamp (admin-api.md §11).
 *
 * The handler is kept separate from `auth.ts` so it can be exercised directly
 * by the integration test, and it never throws: a sign-out must succeed even
 * if the audit write does not.
 */

/** The shape this adapter reads out of the Auth.js `signOut` event. */
export interface SignOutEvent {
  /** JWT strategy — the decoded session token (`uid` is the staff id). */
  token?: { uid?: unknown } | null;
  /** Database strategy — the ended session (`userId` is the staff id). */
  session?: { userId?: string; user?: { id?: string } | null } | null;
}

/**
 * The Auth.js event payload is typed by the library, and its JWT type is not
 * augmentable from this package layout — so the payload is accepted as
 * `unknown` and narrowed here, defensively.
 */
export async function recordSignOutEvent(message: unknown): Promise<void> {
  const event = (message ?? {}) as SignOutEvent;

  const tokenId = typeof event.token?.uid === "string" ? event.token.uid : undefined;
  const sessionId =
    typeof event.session?.userId === "string"
      ? event.session.userId
      : typeof event.session?.user?.id === "string"
        ? event.session.user.id
        : undefined;

  const actorId = tokenId ?? sessionId;
  if (!actorId) {
    return;
  }
  await recordLogout({ actorId });
}
