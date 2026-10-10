# Admin API (authenticated, permission-gated)

**Feature**: 001-zain-b2b-platform | **Companion**: `README.md`, `plan.md` §Auth/RBAC, `spec.md` FR-020–FR-035, SC-004, SC-012, US12.

Every endpoint requires a valid session; the database user row (role, `active`, `tokenVersion`) is loaded per request (US12.4) and the permission matrix is enforced server-side (FR-022). Denied → `403 FORBIDDEN`. Mutations are optimistic-locked (`version`), audited via `ActivityLog`.

## Roles (FR-021)

| Role | Abbrev | Matrix intent |
|---|---|---|
| Super Admin | SA | everything |
| Content Manager | CM | content: cms, pages, media, seo, settings, catalog read |
| Product Manager | PM | brands, products, categories, suppliers, media upload |
| Sales/Business | SB | clients, inquiries, partnerships, media upload |

Permission tokens use `resource:action` (e.g. `brands:update`, `inquiries:statusChange`). The full matrix is defined in code and exhaustively unit-tested (SC-004).

## 1. Auth (Auth.js v5 endpoints)

| Method + Path | Description | Permission |
|---|---|---|
| `GET/POST /api/auth/*` | sign-in (credentials), sign-out, session fetch | none (public) |
| `GET /api/auth/session` | current identity (minimal: id, name, email, role, active) | session |
| `POST /api/auth/change-password` | staff password change | session; bumps `tokenVersion` (revokes others) |

Login throttling/lockout per account+IP (US3.4); failed attempts recorded. Role/active changes apply on next request (US12.4).

## 2. Dashboard

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/dashboard/overview` | counts (new leads, published entities, recent activity) | `dashboard:read` (all roles) |

## 3. Catalog CRUD (Brand, Product, Supplier, Category, Client, Location)

Uniform per resource `R` (`brands`, `products`, `suppliers`, `categories`, `clients`, `locations`):

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/{R}?page&pageSize&status&q` | paginated list (admin view incl. drafts) | `{R}:read` |
| `GET /api/admin/{R}/{id}` | detail (both locales, version, audit trail summary) | `{R}:read` |
| `POST /api/admin/{R}` | create | `{R}:create` |
| `PUT /api/admin/{R}/{id}` | update (body incl. `version`; `If-Match` supported) | `{R}:update` |
| `POST /api/admin/{R}/{id}/publish` | `draft→published` + cache tag invalidation | `{R}:publish` |
| `POST /api/admin/{R}/{id}/unpublish` | `published→draft` | `{R}:publish` |
| `POST /api/admin/{R}/{id}/archive` · `/restore` | lifecycle | `{R}:archive` |
| `POST /api/admin/{R}/{id}/visibility` | toggle `isActive` | `{R}:visibility` |
| `DELETE /api/admin/{R}/{id}` | hard delete only when unpublished & unreferenced | `{R}:delete` |

Notes:

- Categories typed by `kind` (`brand|product|supplier`) and validate parent depth ≤ 2.
- Clients: publish+`visibility` **and** `disclosureApproved` both required for public appearance; toggling disclosure is a `409`-safe mutation that writes `ActivityLog` (confidentiality edge case).
- Locations: staff sets `isVerified` + verified coordinates; map pins render only for verified+published (see `data-model.md` §2.7).
- Nesting helpers: `POST/PUT /api/admin/products/{id}/categories` (replace junction set), `POST /api/admin/products/{id}/images` (ordered media refs).

## 4. Leads (Inquiry, PartnershipRequest)

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/inquiries?status&page` · `/partnerships` | list w/ status filter | `inquiries:read` / `partnerships:read` |
| `GET .../{id}` | detail + internal notes | `*:read` |
| `PUT .../{id}` | edit internal notes (not lead-supplied fields) | `*:update` |
| `POST .../{id}/status` | `{ "status": "contacted|inProgress|closed", "version": … }` — shared pipeline (Clarification 3); reopen allowed `closed→contacted` | `*:statusChange` |
| `DELETE .../{id}` | delete (anonymize-first option) | `*:delete` |

All status transitions write `ActivityLog` (actor, action, target, timestamp). No outbound notifications exist (Clarification 1). Partnership attachment download: `GET /api/admin/partnerships/{id}/attachment` with `attachmentAccess` audit (FR-035).

## 5. Media

| Method + Path | Description | Permission |
|---|---|---|
| `POST /api/admin/media` | multipart upload (MIME+magic-byte+size allowlist, randomized keys, SHA-256) | `media:upload` |
| `GET /api/admin/media?kind&page` | library list | `media:read` |
| `PUT /api/admin/media/{id}` | edit `alt_en`/`alt_ar` | `media:update` |
| `POST /api/admin/media/{id}/archive` | soft-archive when unreferenced | `media:archive` |
| `DELETE /api/admin/media/{id}` | purge archived row (checked unused) | `media:delete` |

Attachment access granted to lead roles (SB) is still an audited event (FR-035). Public images → `url`/variants in Media responses.

## 6. CMS

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/cms/sections` | registry list (section_key × locale, draft & published status) | `cms:read` |
| `GET /api/admin/cms/sections/{sectionKey}?locale=en` | draft + published payloads | `cms:read` |
| `PUT /api/admin/cms/sections/{sectionKey}/{locale}` | write `draft_content` only (Zod-typed per section) | `cms:update` |
| `POST /api/admin/cms/sections/{sectionKey}/{locale}/publish` | copy draft→published + tag invalidation | `cms:publish` |
| `POST /api/admin/cms/sections/{sectionKey}/{locale}/unpublish` | clear published | `cms:publish` |
| `POST /api/admin/cms/sections/{sectionKey}/{locale}/approve-stat` | mark statistic/claim `approved` (FR-007; "50 years" gated here) | `cms:update` |

No endpoint accepts arbitrary HTML/layout (Constitution IV).

## 7. SEO

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/seo?targetType&targetId&locale` | read SEO rows | `seo:read` |
| `PUT /api/admin/seo/{targetKey}/{locale}` | update title/description/OG/canonical/noindex (length caps) | `seo:update` |
| `GET /api/admin/seo/redirects` · `POST .../redirects` · `DELETE .../redirects/{id}` | manage `SlugRedirect` overrides (slug changes auto-create rows) | `seo:update` |

## 8. Users & roles (US12)

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/users?page` | list staff (no passwordHashes) | `users:read` |
| `POST /api/admin/users` | create (initial password, email) | `users:create` |
| `PUT /api/admin/users/{id}` | update name/email/role/active (bump `tokenVersion` where needed) | `users:update` |
| `POST /api/admin/users/{id}/reset-password` | admin reset + token bump | `users:update` |
| `POST /api/admin/users/{id}/deactivate` | immediate logout via `tokenVersion` bump (US12.4/12.5) | `users:update` |

Guards: last active Super Admin cannot be deactivated/demoted; a user cannot deactivate themselves. All user/permission changes → `ActivityLog` (FR-035).

## 9. Settings

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/settings` | all settings (both locales) | `settings:read` (CM/SA) |
| `PUT /api/admin/settings/{key}` | update localized typed value (per-key Zod) — incl. `privacy_notice` (Open Item 6) | `settings:update` |

## 10. Activity log

| Method + Path | Description | Permission |
|---|---|---|
| `GET /api/admin/activity?actor&action&entityType&from&to&page` | filtered append-only log | `activity:read` |

Read-only; no write/update/delete paths exist (append-only, FR-035/SC-012). Dashboard + this endpoint support the SC-012 acceptance scenario (100% of sensitive actions present).

## 11. Admin audit matrix (SC-012 surface)

Actions that MUST appear in `ActivityLog`: login success/failure, logout, create, update, delete/archive, publish/unpublish, visibility change, permission change (role/active), user create/reset/deactivate, settings update, status change, attachment access, slug/report autogeneration events where relevant. Integration tests assert presence with actor/action/target/timestamp.

---

*Every endpoint above maps to `resource:action` in the code matrix; `contracts/README.md` §11 traces to spec FRs/SCs.*