# API Contracts — Shared Conventions

**Feature**: 001-zain-b2b-platform | **Date**: 2026-10-07 | **Companion docs**: `public-api.md` (anonymous), `admin-api.md` (authenticated), `plan.md` §API Approach, `spec.md` FR-015–FR-035.

These contracts define the REST surface implemented under `src/app/api`. Server components read domain data via services directly; only these endpoints cross the HTTP boundary.

## 1. Base & versioning

- Base path: `/api/...` (same origin; no external API consumers in MVP).
- Content type: `application/json; charset=utf-8` (uploads: `multipart/form-data`).
- No URL version prefix in MVP; breaking changes would require one (documented, never silent).

## 2. Locale

- Optional request header `Accept-Language` or query `locale=en|ar` selects the locale of **error messages and localized response fields**; default `en`.
- Public *content* payloads carry both language variants where stored (`name_en`/`name_ar`) or the caller-requested locale's value where singular; admin payloads return both.

## 3. Authentication & authorization

- Auth.js v5 endpoints handle login/logout/session (JWT strategy, identity-only cookie).
- Admin endpoints: session cookie **plus** per-endpoint permission from the code matrix (`resource:action`), enforced server-side (FR-022). The user row (role, active, tokenVersion) is read from DB on every request (US12.4).
- Public endpoints: anonymous, rate-limited (FR-019).
- Permissions are listed per endpoint in `admin-api.md`. Denial → `403 FORBIDDEN` (never a partial result).

## 4. Error envelope (all non-2xx JSON responses)

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Localized human-readable text", "details": [ { "path": "email", "issue": "invalid_email" } ] } }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Zod rejection; `details[]` maps field path → issue key (localized via `messages/{locale}.json`, FR-003) |
| `UNAUTHORIZED` | 401 | No/invalid session or stale `tokenVersion` |
| `FORBIDDEN` | 403 | Session valid, permission missing (FR-022) |
| `NOT_FOUND` | 404 | Unknown id/slug |
| `VERSION_CONFLICT` | 409 | Optimistic-lock mismatch (body carries current `version`) |
| `SLUG_CONFLICT` | 409 | Slug uniqueness violation (FR-036) |
| `RATE_LIMITED` | 429 | Public rate limit or login throttle; `Retry-After` header |
| `PAYLOAD_TOO_LARGE` | 413 | Upload/size caps exceeded |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | MIME/magic-byte allowlist rejection |
| `INTERNAL` | 500 | Unhandled — logged with request id; no internals leaked |

`message` is always localized per §2. Codes are stable identifiers (tests assert on `code`, not text).

## 5. Success shapes

- Collections: `{ "items": [...], "total": number, "page": number, "pageSize": number }` (offset pagination; default `pageSize=20`, max 100).
- Single resource: the object itself.
- Mutations: `201` + created object; `200` + updated object; `204` for status-only ops where no body is useful (documented per endpoint).

## 6. Concurrency

- Every update (`PUT`/`PATCH`-equivalent) accepts `version` (body) or `If-Match: <version>` header; server executes `WHERE id AND version` → `409 VERSION_CONFLICT` with `details.currentVersion` if lost.
- `200` responses include the new `version`.

## 7. Rate limits (public)

| Endpoint | Limit (plan default) | Key |
|---|---|---|
| `POST /api/inquiries`, `POST /api/partnerships` | 5 / 10 min / IP+email | `RateLimitCounter` |
| `GET /api/search` | 30 / min / IP | `RateLimitCounter` |
| Login (Auth.js) | 5 / 15 min / account+IP, then lockout with localized message (US3.4) | in-process |

Exceeding → `429 RATE_LIMITED` + `Retry-After`.

## 8. Security rules applying to every endpoint

- Zod validation server-side even if the client validated (double validation by design).
- CSRF: Auth.js default protections + `Origin` check on state-changing requests.
- No endpoint ever returns `passwordHash`, raw IPs (only hashed where stored), or unpublished/confidential content.
- Admin responses are permission-filtered at the service layer, not by omitting fields client-side.
- Idempotency: `POST` lead endpoints are *not* idempotent by design (duplicate submits are rate-limited and deduplicated by identical payload within 60s — plan-level rule, implementation detail).

## 9. Media conventions

- Upload: `POST /api/admin/media` multipart `file` (+ optional `alt_en`, `alt_ar`) → `201` with `{ id, kind, mimeType, byteSize, url, variants? }`.
- Public media served from storage via app-proxied path or signed/public bucket URL (decision at implementation; contract: media responses carry a stable `url` usable in `<img src>`).
- Document downloads set safe `Content-Type` + `Content-Disposition: attachment` (FR-033).

## 10. Health

- `GET /api/health` → `200 { status: "ok", db: "up" }` or `503` (DB down). No auth; no sensitive data.

## 11. Traceability

| Contract area | Spec |
|---|---|
| `POST /api/inquiries`, `/api/partnerships` | FR-017, FR-018, FR-019, SC-003, Clarifications 1–2 |
| `GET /api/search` | FR-015, SC-006 |
| Admin CRUD/publish | FR-020–FR-034, US5, US6, US9–US11 |
| Permissions/auth | FR-021, FR-022, SC-004, US12 |
| Activity log endpoints | FR-035, SC-012 |
| Conventions (errors, 409, i18n) | FR-003, spec edge case (concurrent edits) |
