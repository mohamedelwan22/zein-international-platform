# Implementation Plan: Zain International Trading B2B Distribution & Import Platform (MVP)

**Branch**: `001-zain-b2b-platform` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-zain-b2b-platform/spec.md`

## Summary

Build the approved MVP — a premium bilingual (Arabic/English, RTL-first) B2B corporate website with an informational product catalog, lead-generation forms, structured CMS, and a role-based Admin Dashboard — as a **single full-stack Next.js (App Router) application in TypeScript**, backed by **PostgreSQL via Prisma**, **JWT identity sessions with per-request database authorization (server-side RBAC)**, **PostgreSQL-native search**, **S3-compatible media storage**, and **Docker-based deployment with scheduled backups and a documented restore drill**. Public pages are statically generated with tag-based cache invalidation for SEO and performance; all mutations go through a documented REST API with Zod validation, rate limiting, and audit logging. The stack is finalized here per Constitution Principle X; no MVP-excluded capability (checkout, pricing, accounts, ordering, CRM, ERP, outbound notifications, analytics) is designed in.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js LTS (24.x at time of planning)

**Primary Dependencies**: Next.js 16.x (App Router, Cache Components enabled as the greenfield default; ≥16.3.8 security patch, lockfile-pinned) + React; Tailwind CSS (design tokens from `docs/DESIGN_SYSTEM.md`); Framer Motion (restrained motion, reduced-motion aware); Prisma ORM; Zod; Auth.js v5 (`next-auth` — Credentials provider with **JWT session strategy**, which the Credentials provider requires; identity-only token + per-request DB authorization) with argon2id hashing (`@node-rs/argon2`); next-intl (locale routing, messages, RTL); pino (structured logs). Dev/test: Vitest, Playwright (+ axe-core), ESLint, Docker Compose (PostgreSQL + MinIO for local S3)

**Storage**: PostgreSQL 17+ (relational domain data, CMS content, activity logs, search indexes); S3-compatible object storage for media (MinIO locally, any S3-compatible provider in production); approved static assets (`docs/logo.png`, `docs/hero.png`) copied byte-identical into `public/`

**Testing**: Vitest (unit + integration against ephemeral PostgreSQL), Playwright (end-to-end journeys in both locales/viewports, RBAC matrix, axe accessibility scans), `tsc --noEmit` + ESLint as CI gates

**Target Platform**: Web — evergreen browsers on desktop/laptop/tablet/mobile; Linux container deployment (VPS/cloud)

**Project Type**: web application (one deployable: public site + Admin Dashboard + REST API)

**Performance Goals**: spec SC-009 (public pages usable < 3s on typical mobile, no layout shift), SC-006 (search perceived < 1s), CLS < 0.1; engineering targets derived from these (Lighthouse ≥ 90 on public pages)

**Constraints**: Arabic/English RTL from the foundation; no e-commerce surfaces anywhere in the UI; no outbound notifications, no visitor analytics (Clarifications 2026-10-07); no invented company facts; accessibility per FR-040 (4.5:1 contrast, 44×44px targets, keyboard, reduced motion); stack/infrastructure must stay simple (Constitution Principle X)

**Scale/Scope**: ~20 public routes, ~15 admin modules, 4 fixed roles, staff users < 25, catalog scale hundreds to low thousands of products, single tenant; content volume makes PostgreSQL-native search and cached static rendering sufficient (no external search service, no Redis, no queue)

**Unknowns**: none — all Technical Context fields are resolved (see `research.md` for decisions and alternatives). Map provider and hosting provider remain *client-confirmation items* (spec Open Items 7) and are isolated behind adapters; they do not block development.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Constitution gate | Status | Evidence in this plan |
|---|---|---|---|
| I | Requirements before implementation | PASS | Every design element traces to spec FR-001–FR-046 / SC-001–SC-015 / Clarifications; unresolved items preserved as Open Items, not guessed |
| II | MVP boundary | PASS | No checkout/payment/pricing/customer accounts/ordering/CRM/ERP anywhere in architecture; notifications and analytics explicitly excluded (Out of Scope) |
| III | Data is governed | PASS | Seed data only from approved profile content; "50 years" counter withheld pending approval; brand/supplier/client/location publication gated by approval flags; no invented coordinates or facts |
| IV | Structured CMS, not page builder | PASS | CMS = predefined section keys with typed fields (Home/About/Contact) + draft/published payloads; no arbitrary layout/markup injection path exists in the content model |
| V | Security and least privilege | PASS | Authentication, argon2id, JWT identity-only sessions with per-request database authorization + token-version revocation, server-side permission checks on every admin endpoint, rate limiting, upload validation, append-only activity logging (see Security Strategy) |
| VI | Bilingual from the foundation | PASS | Locale-segment routing (`/en`, `/ar`), per-language DB fields, `dir` attribute per locale, CSS logical properties throughout, localized validation/messages, per-language SEO metadata |
| VII | Discovery-first public experience | PASS | Route and information architecture follows Company → Brands → Products → Inquiry; catalog UI has no price/stock/cart/rating affordances by construction |
| VIII | Reusable domain model | PASS | Explicit entities + validated cardinalities in `data-model.md` (this closes the "exact cardinalities MUST be validated during architecture planning" requirement) |
| IX | Quality is part of done | PASS | DoD embedded in Development Workflow and Testing Strategy (states, permissions, i18n, a11y, tests, passing build per feature) |
| X | Progressive complexity | PASS | One deployable, PostgreSQL-native search, in-process rate-limit counters, no Redis/queue/microservices/external APM; stack finalized at `/plan` as required |
| XI | Source of truth hierarchy | PASS | Plan sits at level 4; conflicts (English name variants, missing proposal PDF) preserved as open items, never silently resolved |
| XII | Traceability | PASS | Traceability section maps plan areas → spec FRs; tasks (next phase) will map task → FR |
| XIII | Design system & brand fidelity | PASS | Tokens (palette/typography/spacing/radius) taken from `docs/DESIGN_SYSTEM.md`; approved assets copied byte-identical (hash-verified) and never regenerated; hero text stays in HTML |
| XIV | Skills-guided development | PASS | Skills inspected via `skills-lock.json` + `.agents/skills`: frontend-design, ui-ux-pro-max, responsive-design, web-design-guidelines (loaded and applied), vercel-react-best-practices + typescript-advanced-types (loaded because the stack adopted React/Next + TS) |
| NFR | Non-Functional Standards (a11y, responsive, performance, SEO, media, structured content) | PASS | Dedicated sections below cover each standard |
| Plan gate | `/plan` workflow requirements (MVP boundary, dependencies, frontend/backend/data separation, security-sensitive work, migration strategy, verification strategy, no unnecessary infrastructure complexity, stack finalized) | PASS | Sections: Architecture, Deployment, Migration, Testing, Security; Complexity Tracking records no violations |

**Gate verdict: PASS — zero violations; no Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/001-zain-b2b-platform/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — decisions, rationale, alternatives
├── data-model.md        # Phase 1 output — entities, cardinalities, validation, state machines
├── quickstart.md        # Phase 1 output — runnable validation guide
├── contracts/           # Phase 1 output — REST interface contracts
│   ├── README.md        # Shared conventions (versioning, auth, errors, pagination, i18n)
│   ├── public-api.md    # Anonymous endpoints: search, inquiry, partnership
│   └── admin-api.md     # Auth + admin CRUD/publish/activity endpoints
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16 pass)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
zein-platform/
├── docs/                        # Approved sources + approved assets (logo.png, hero.png)
├── specs/                       # Spec-Kit artifacts
├── public/
│   ├── logo.png                 # Byte-identical copy of docs/logo.png (hash-verified)
│   └── hero.png                 # Byte-identical copy of docs/hero.png (hash-verified)
├── prisma/
│   ├── schema.prisma            # Domain model (see data-model.md)
│   ├── migrations/              # Versioned SQL migrations (Prisma Migrate)
│   └── seed.ts                  # Idempotent seed of approved profile content only
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (site)/          # Public: home, about, values, sustainability,
│   │   │   │                     # innovation, brands[/slug], products[/slug],
│   │   │   │                     # suppliers[/slug], clients, geographic-presence,
│   │   │   │                     # contact, partnership, search
│   │   │   ├── (auth)/login/
│   │   │   └── (admin)/admin/   # dashboard, brands, products, categories, suppliers,
│   │   │                         # clients, locations, cms, media, seo, inquiries,
│   │   │                         # partnerships, users, activity-logs, settings
│   │   └── api/                 # REST route handlers (contracts/ documents these)
│   │       ├── inquiries/route.ts
│   │       ├── partnerships/route.ts
│   │       ├── search/route.ts
│   │       ├── auth/[...]       # Auth.js session endpoints
│   │       └── admin/…          # Per-module admin endpoints
│   ├── server/
│   │   ├── db/                  # Prisma client, query helpers
│   │   ├── auth/                # Session resolution, permission matrix, requirePermission()
│   │   ├── validation/          # Shared Zod schemas (client + server)
│   │   ├── services/            # Domain services: catalog, cms, media, leads, seo,
│   │   │                         # users, activity, settings, search
│   │   ├── storage/             # MediaStorage interface + S3/MinIO driver
│   │   └── http/                # Error envelope, rate limiter, audit helper
│   ├── components/
│   │   ├── site/                # Public UI (Navbar, Hero, cards, sections, forms)
│   │   ├── admin/               # Admin UI (sidebar, DataTable, forms, uploader…)
│   │   └── geography/           # MapSection + map-provider adapter (client-confirmed)
│   ├── i18n/                    # next-intl config, messages/en.json, messages/ar.json
│   └── lib/                     # Logger (pino), feature flags, small utilities
├── tests/
│   ├── unit/                    # Schemas, permission matrix, slug/search helpers
│   ├── integration/             # Services + API handlers against ephemeral Postgres
│   └── e2e/                     # Playwright journeys (both locales, viewports, axe)
├── docker/                      # compose.yaml (postgres, minio), production Dockerfile
├── .github/workflows/           # CI: lint, typecheck, unit, integration, build, e2e
└── package.json / pnpm-lock.yaml / tsconfig.json / tailwind / next.config …
```

**Structure Decision**: Single full-stack Next.js application with strict internal layering — UI (`src/app`, `src/components`) → HTTP boundary (`src/app/api` route handlers) → domain services (`src/server/services`) → data (`prisma`). Server-side page reads call services directly (no internal HTTP hop); the REST API exists as the explicit contract for mutations, admin client interactions, and search. Rationale: one deployable satisfies every requirement at this scale, satisfies PR §45's "Next.js/React + Node.js + REST" direction, and avoids infrastructure the constitution forbids prematurely (Principle X); frontend/backend/data concerns are separated by layer and dependency direction rather than by process boundaries.

## Architecture Overview

```text
Browser (en | ar, ltr | rtl)
   │
   ├── Public pages ──► RSC (cached) ──► services ──► PostgreSQL
   │                        ▲ publish → tag invalidation (revalidateTag / cache tag APIs)
   ├── Search overlay ──► GET /api/search ──► search service ──► PostgreSQL (tsvector + pg_trgm)
   ├── Inquiry/Partnership forms ──► POST /api/{inquiries|partnerships}
   │                                  (Zod validate → rate limit → persist with consent + context)
   └── Admin (session cookie) ──► route handlers ──► requirePermission() ──► services ──► PostgreSQL
                                                              │
                                                              ├──► MediaStorage (S3/MinIO)
                                                              └──► ActivityLog (append-only)
```

- **Rendering**: public content pages are statically generated/ISR-equivalent under Cache Components (cached RSC with tag-based invalidation on publish); contact/partnership/search and all admin pages are dynamic. This directly serves SC-009 (fast mobile), SC-011 (per-locale metadata), and US6 publish semantics (draft edits never leak to the public site).
- **Request flows**: every mutation is validated twice (client Zod schema for UX, server handler re-validation as enforcement); every admin request resolves the session, loads the user's current role from the database (so role changes/deactivations take effect on the next action — spec US12.4), and checks the permission matrix server-side.

## Major Technical Decisions and Rationale

Full decision records with alternatives: `research.md`. Summary:

| Area | Decision | Rationale (requirement tie) |
|---|---|---|
| App framework | Next.js 16 (App Router + Cache Components), single deployable | SSR/ISR + metadata API are the shortest path to bilingual SEO and <3s mobile (SC-009, SC-011, FR-043); Cache Components is the create-next-app default and recommended model for new apps (16.4); PR §45 direction; Principle X |
| API style | REST route handlers (documented in `contracts/`) | PR §45 ("REST API"); explicit, testable boundaries for `/tasks` and Playwright API tests; server components read via services (no redundant HTTP) |
| Database | PostgreSQL + Prisma + Migrate | PR §45; relational fit for catalog/RBAC/leads; unique constraints enforce slug rules (FR-036); migration strategy = Prisma Migrate |
| Auth | Auth.js v5 Credentials + **JWT session strategy** (required by Credentials provider); identity-only token, argon2id (`@node-rs/argon2`), `tokenVersion` revocation claim | PR §45 ("secure session/JWT"); role/active/status are loaded from the DB on every request (US12.4 satisfied regardless of JWT lifetime); `tokenVersion` mismatch forces re-auth (US12.4/US12.5 revocation); database-session alternative rejected — Credentials provider does not support it |
| RBAC | Code-defined permission matrix (`resource:action`), role enum on user | 4 documented roles only (FR-021); "basic RBAC" (PR §47); server-side `requirePermission()` (FR-022); matrix is unit-testable for SC-004 |
| i18n | next-intl, `/[locale]` segments, per-language DB columns, CSS logical properties | FR-001–FR-004; RTL is a layout foundation, not a patch (Constitution VI); logical properties make one layout serve both directions (responsive-design skill) |
| Search | PostgreSQL `tsvector('simple')` over both locales + `pg_trgm` partial matching | FR-015/SC-006 at this scale; zero extra infrastructure; dedicated engines (Meilisearch/Elastic) rejected as premature (Principle X) |
| CMS | `cms_sections` rows keyed by section + locale with `draft` and `published` JSON payloads | FR-032/US6: structured fields only, preview vs publish safety, no page builder |
| Media | `MediaStorage` interface → S3-compatible driver; server-mediated upload with MIME sniffing + size limits | PR §45 (S3-compatible/Supabase); FR-033 secure uploads; driver swap covers the client-confirmed storage decision |
| Maps | Provider-neutral adapter; Leaflet + OpenStreetMap default for dev; no invented coordinates | PR §45 (Google/Mapbox to evaluate) + map provider is Open Item 7; verified-location-only rule (FR-013) preserved |
| State/versions | Optimistic concurrency (`version` column → HTTP 409 `VERSION_CONFLICT`) | Spec edge case "concurrent edits … approach defined at planning" — decided here |
| Rate limiting | Postgres-backed fixed-window counters (in-process for login throttling) | FR-019/US3.4; avoids Redis (Principle X) while surviving restarts |
| Motion | Framer Motion, entrance/hero only, `prefers-reduced-motion` gated | DESIGN_SYSTEM §15 + PR §45; restrained per Constitution XIII |
| Fonts | next/font self-hosted: Cormorant Garamond (display), Manrope (Latin UI), Amiri (Arabic display), IBM Plex Sans Arabic (Arabic UI) | DESIGN_SYSTEM §8 two-family split with first-class Arabic typography; self-hosting prevents layout shift (FR-042) |
| Deployment | Docker (standalone Next build) + Compose on Linux VPS; Caddy for HTTPS | PR §45 (VPS/cloud); hosting remains client-confirmed (Open Item 7) but containerization keeps it portable |
| Backup | Nightly `pg_dump` + media bucket versioning; documented restore drill before launch | FR-046/SC-015 (Clarifications 2026-10-07) |

## Domain and Database Approach

Defined in full in `data-model.md`. Highlights:

- **Entities**: User, Role (enum + code-level permission matrix), Brand, Product, Supplier, Client, Category (typed `brand|product|supplier`), Location, CmsSection, Media, SeoMeta, SlugRedirect, Inquiry, PartnershipRequest, Settings, ActivityLog, RateLimitCounter, AuthAttempt.
- **Cardinality validation** (Constitution VIII): Brand 1→* Product (required FK); Product *→1 Supplier (optional); Product ≥1 Category, Brand ≥1 Category, Supplier ≥1 Category (m2m join tables); Inquiry/Partnership optional FKs to Product/Brand/Supplier with `SET NULL`; PartnershipRequest → Media attachment (optional); every editable entity carries `status`/visibility flags, `version` for optimistic locking, timestamps, and `createdBy/updatedBy`.
- **Localization model**: queryable text (names, slugs, meta) uses per-language columns (`name_en`, `name_ar`, `slug_en`, `slug_ar`) for filtering/indexing; rich CMS content uses JSON payloads per locale; missing translation falls back to the available approved variant per spec edge case.
- **State machines**: lead statuses New → Contacted → In Progress → Closed (both leads types, Clarifications); entity lifecycle `draft → published → archived` + `isActive`; Location adds `isVerified` (verified AND published required for public output); CMS `draft`/`published` payloads; all transitions audited.
- **Publication safety**: every public query is a single predicate (`status = published AND isActive = true …`); confidential clients (`disclosureApproved = false`) are excluded at the query layer — never by UI filtering.

## API Approach

Contracts live in `contracts/` (shared conventions in `contracts/README.md`, public endpoints in `public-api.md`, admin endpoints in `admin-api.md`).

- **Public (anonymous, rate-limited)**: `POST /api/inquiries`, `POST /api/partnerships` (consent field required), `GET /api/search`.
- **Auth**: Auth.js v5 endpoints for login/logout/session; JWT strategy (mandatory for the Credentials provider) with an **identity-only** cookie (httpOnly, `SameSite=Lax`, `Secure`) — no role/claims trusted from the token.
- **Admin (session + permission per endpoint)**: CRUD + publish/preview per module, status transitions for leads, media upload, CMS draft/publish, SEO, users/roles, settings, activity log read, dashboard overview.
- **Conventions**: JSON error envelope `{ error: { code, message, details? } }` with locale-aware messages (FR-003); offset pagination `{ items, total, page, pageSize }`; `If-Match: <version>` (or body `version`) for updates → `409 VERSION_CONFLICT`; no admin response ever omits permission checks (FR-022).

## Auth/RBAC Approach

- Sign-in/sign-out with credentials; argon2id password hashing (`@node-rs/argon2`); login throttling (per account + IP) with localized lockout feedback and recorded events (US3.4).
- JWT session cookie resolved on every admin request but used **only as an identity proof**: user id is looked up in the database each request, so status/role changes apply at the next action (US12.4). A `tokenVersion` claim (stored on the user row) is compared per request — password change or deactivation bumps it, invalidating all outstanding tokens immediately (US12.5-style revocation). Split config: edge-safe `auth.config.ts` (middleware) + Node `auth.ts` (adapter-less, Credentials-only), per Auth.js v5 best practice.
- Middleware gates `/admin` for UX only — **route handlers and services enforce authorization** (FR-022).
- Permission matrix: Super Admin = all; Content Manager = cms/pages, media, seo, settings; Product Manager = brands, products, categories, media upload; Sales/Business = clients, inquiries, partnerships, media upload. Matrix is the subject of unit tests asserting SC-004 (100% refusal of unauthorized operations across the four roles).
- Sensitive actions (login, user/role/permission changes, publish, visibility, delete/archive, attachment access) write to `ActivityLog` (FR-035).

## i18n/RTL Approach

- `next-intl` with `[locale]` route segment (`/en/...`, `/ar/...`), locale-aware middleware (redirect/persist choice; language switch preserves current location — FR-001), `lang`/`dir` set per locale.
- UI chrome messages in `messages/en.json` / `messages/ar.json`; validation error maps keyed by Zod issue → localized string (FR-003).
- Content: per-language columns for entity text; JSON per locale for CMS sections; explicit fallback to the available approved variant with staff-visible flag (spec edge case).
- Layout: CSS logical properties (`margin-inline`, `padding-inline-start`, `inset-inline`, `text-align: start`) and Tailwind logical utilities — one RTL-correct layout, verified by Playwright in both directions (SC-001, SC-008); mixed-script content (Latin brand names inside Arabic) verified in E2E (spec edge case).

## Search Approach

- `search_document` generated column per entity row concatenating both locales' name/summary fields, indexed with `tsvector('simple')` (language-neutral, works for Arabic where stemming support is weak) plus `pg_trgm` GIN indexes on slugged names for partial/prefix matching.
- `GET /api/search` queries products, brands, suppliers, categories in one round trip with type labels, paginated, restricted to published/approved rows (confidentiality edge case), returning localized titles for the active locale.
- Rationale: SC-006 (<1s perceived) is comfortably met at MVP scale with zero new infrastructure; a dedicated search service is documented in `research.md` as a future option if the catalog grows by orders of magnitude.

## SEO Architecture

- Per-locale `generateMetadata`: title, description, canonical, Open Graph (approved og image), `hreflang` alternates for `en`/`ar` (FR-043, SC-011).
- SEO fields stored in `SeoMeta` (entity + locale): meta title/description/slug/OG image/canonical, editable per language (FR-034); unpublished/missing metadata falls back to localized defaults derived from approved content (US10.2).
- Slugs unique per (entity type, locale) via partial unique indexes (FR-036); slug changes write a `SlugRedirect` row so old URLs 301 to the new address (US10.3); `sitemap.xml` generated from published entities; `robots.txt`; clean SEO-friendly URLs (FR-042).

## Content Architecture (CMS)

- `cms_sections(section_key, locale, draft_content JSONB, published_content JSONB, version, updatedBy, publishedAt)` with a fixed registry of section keys: Home (hero, ctas, statistics, about preview, featured brands/products, categories, sustainability, innovation, geographic presence, mission, vision, final CTA), About (story, history, profile, journey, mission, vision, values, sustainability, innovation), Contact (phone, email, address, working hours, map, social links).
- Editing writes `draft_content` only; Publish copies draft → published and triggers tag-based cache invalidation (US6.2 publish safety). Typed field schemas (Zod) define the allowed fields per section — there is structurally no way to inject arbitrary markup or layouts (FR-032, Constitution IV).
- Statistics values carry an `approved` flag; unapproved claims (including "50 years") are not rendered as counters until confirmed (FR-007).

## Media Architecture

- `Media` rows (id, kind, mimeType, byteSize, storageKey, alt_en/alt_ar, archive state, uploader) in a single library; entity references are FK columns (brand.logoMediaId, product images via join or ordered FKs, partnership attachment, OG image) — usage is resolved by querying references (no sync-prone usage table).
- Upload: server-mediated multipart → allowlist (png, jpg, webp, avif for images; pdf/doc/docx for documents), magic-byte sniffing, size limits (images ≤ 10 MB, documents ≤ 20 MB — plan-level defaults, adjustable), randomized storage keys, downloads served with safe `Content-Disposition`/`Content-Type`; only authorized roles may upload (FR-033).
- Approved assets: `docs/logo.png` and `docs/hero.png` are copied byte-identical (SHA-256 verified) into `public/` at foundation time and referenced everywhere; they are never regenerated, recolored, or filtered (Constitution XIII; spec US12.3). Hero text/navigation remain real components.

## Testing Strategy

- **Unit (Vitest)**: Zod schemas (valid/invalid, both locales), permission matrix completeness (every role × operation), slug generation/collision, search query builder, i18n fallback logic.
- **Integration (Vitest + ephemeral PostgreSQL)**: services and REST handlers — CRUD + publish lifecycle, permission refusal (SC-004), lead submission incl. consent/rate limiting, slug redirect behavior, optimistic-lock 409, activity-log writes (SC-012), seed provenance (SC-010: seeded rows carry approved-source references).
- **E2E (Playwright)**: journey tests mapped 1:1 to spec acceptance scenarios — bilingual switch + RTL (SC-001), home → catalog → detail → inquiry (SC-002), inquiry/partnership completion (SC-003), CMS edit → publish → public reflect (SC-005), search both languages + empty state (SC-006), keyboard/contrast/reduced-motion passes with axe-core (SC-007), four viewports with zero horizontal scroll (SC-008), admin RBAC matrix across four roles.
- **Quality gates (CI)**: `tsc --noEmit`, ESLint, unit, integration, production build, E2E + axe; per Constitution IX no feature merges without these plus its states/permissions/i18n coverage. Verification uses the `browser-automation` skill during implementation (Constitution XIV).

## Security Strategy

- Transport HTTPS only (Caddy/auto-HTTPS); secure httpOnly SameSite session cookies; CSRF protection via Auth.js + Origin checks on mutations.
- argon2id hashing; login rate limiting/lockout with event recording (US3.4); every privileged request verifies the identity-only token, compares `tokenVersion`, and loads the user/role from the database (no claims trusted from the token).
- Server-side authorization on every privileged operation (FR-022) + least-privilege matrix (FR-021).
- Zod validation + sanitization on all inputs; CMS content rendered only through typed components (no raw HTML injection path — FR-032); output escaping by React.
- Uploads: type allowlist + magic-byte sniffing + size caps + randomized keys + non-executable storage + authorization; partnership attachments access is audited (FR-035).
- Rate limiting on public submissions (FR-019) and search.
- Security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` for admin, HSTS); secrets via environment only; dependency audit in CI.
- Append-only `ActivityLog` (no update/delete paths exposed); confidential client records excluded at query layer.

## Performance Strategy

- Cached public rendering (Cache Components, tag-based revalidation on publish); route-level dynamic only where needed.
- `next/image` with responsive variants and priority hero; approved hero served through optimized renditions without visual alteration; self-hosted fonts via `next/font` (no layout shift); lazy loading below the fold (FR-042).
- DB indexes on slugs (unique per locale), publication predicates, FKs, status columns; pagination for all long lists; efficient one-query search.
- Bundle discipline per `vercel-react-best-practices` (barrel-import avoidance, dynamic imports for heavy admin widgets/search overlay, parallel data fetching in RSC); restrained Framer Motion usage.
- Verified against SC-009 (<3s usable mobile, no CLS) and SC-006 in E2E/Lighthouse.

## Accessibility Strategy

- Semantic HTML landmarks, visible focus, skip links, accessible labels, alt text on informative images, 4.5:1 contrast checked against the approved palette (gold/lime accents used on dark green surfaces are contrast-verified), 44×44px touch targets, `prefers-reduced-motion` honored by Framer Motion config (FR-040).
- Forms: visible labels, inline errors with `role="alert"`, focus moved to an error summary on failed submit (ui-ux-pro-max guidance), loading/success states (FR-039).
- axe-core scans in CI + manual keyboard walkthroughs per route; no color-only status encoding (lead statuses use text + color).

## Deployment Strategy

- **Local/dev**: `docker compose up` (PostgreSQL + MinIO) + `pnpm dev`; migrations + seed via `pnpm db:migrate && pnpm db:seed`.
- **CI**: on every push — install (locked), lint, typecheck, unit, integration (service container PostgreSQL), build, E2E; migrations applied to a fresh DB in CI to catch drift.
- **Production (default target pending client hosting confirmation, Open Item 7)**: multi-stage Dockerfile → standalone Next.js container; Compose stack (app + Caddy TLS + volume/managed PostgreSQL + S3-compatible media bucket); env-file secrets; zero-downtime restart policy. Containerization keeps the app portable to any VPS/cloud the client confirms.
- **Runbooks**: environment variables documented in `quickstart.md`; pre-production gate checklist (constitution) executed before launch.

## Backup/Recovery Strategy (FR-046, SC-015)

- **Database**: nightly `pg_dump` (custom format) to the media bucket/off-host location, 30-day retention, weekly full tested automatically for restore-readiness (dump integrity check).
- **Media**: S3 versioning enabled (or daily mirrored sync for providers without versioning).
- **Restore drill (pre-launch gate)**: documented procedure in `quickstart.md` — restore dump into a clean instance, boot app against it, verify spot-checked published content and media references; result recorded as evidence for SC-015. Repeatable annually/at major schema changes.
- Backups are taken before every production migration apply (Migration Strategy).

## Observability/Logging

- `pino` structured JSON logs with request IDs and environment-configured levels; container log driver with rotation; `/api/health` (database ping) for uptime checks.
- Product-level audit trail = `ActivityLog` (actor, action, target, timestamp) viewable by authorized roles (FR-035, SC-012).
- Localized public error pages; unhandled exceptions logged with stack + request context.
- Deliberately no third-party APM or visitor analytics in MVP (Clarifications; future ops tooling requires approval). Server logs + health checks cover operational visibility.

## Migration Strategy

- **Tooling**: Prisma Migrate; every schema change is a committed, versioned migration applied identically in dev/CI/staging/production.
- **Flow**: branch → CI applies migrations to empty DB + runs tests → staging apply → production: backup first, apply, smoke test; forward-fix policy (new migration) rather than in-place rollback; restore-from-backup is the recovery path for failed production applies.
- **Seed**: idempotent `seed.ts` separate from migrations; loads only approved profile content (categories, brands, contact settings, values, mission/vision copy) with source references; re-runnable without duplicating rows; final catalog lists remain pending client confirmation (Open Item 4).

## Development Workflow

- Git initialized at implementation start on branch `001-zain-b2b-platform`; small, reviewable commits/PRs; trunk-based with feature branches.
- Build order (maps to the approved feature decomposition): Foundation (project, tokens, design-system shell, approved assets) → database/API foundation → auth + RBAC → i18n/RTL shell → media/storage → public pages (home → about → brands/products → suppliers/clients/locations → contact/partnership) → search → admin modules (dashboard, CRUD, CMS, media, SEO, leads, users, activity) → security hardening → performance/a11y/RTL QA → deployment + backup drill.
- Definition of Done per Constitution IX applies to every task; tasks are generated next by `/speckit.tasks` (traceable, ordered, independently verifiable — not created by this command).
- Verification during implementation uses `browser-automation` for rendered-page checks against `docs/DESIGN_SYSTEM.md` §44 design acceptance criteria.

## Key Technical Risks and Mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Arabic full-text search quality (weak stemming) | `simple` config + `pg_trgm` substring matching over both locales; E2E Arabic search cases; Meilisearch migration path documented if scale/quality demands |
| 2 | RTL regressions in dense admin tables/overlays | Logical-properties-only rule from day one; Playwright RTL pass per admin module; z-index scale (ui-ux-pro-max) for overlays |
| 3 | Privacy/legal content not yet approved — now a *blocking* dependency for both lead forms (Clarifications) | Tracked as Open Item 6; forms ship consent-gated with the notice routed from CMS Settings so content can be dropped in without code change |
| 4 | Client-confirmation gaps (names, tagline, "50 years", final lists, map provider, hosting) | Preserved as Open Items; CMS/adapter isolation means no rework when confirmed; pre-production gate blocks launch without them |
| 5 | Concurrent admin edits silently overwriting work | Optimistic locking (`version` → 409) decided here per spec edge case; UI shows localized conflict message with reload option |
| 6 | Upload abuse (malicious files, oversized bodies) | Allowlist + magic bytes + size caps + rate limits + non-executable storage + E2E attack cases |
| 7 | Publish leaks (draft content reaching public site) | Draft/published payload separation + cache invalidation only on publish + integration tests asserting draft invisibility |
| 8 | Scope creep from excluded capabilities (notifications, analytics, ordering) | Constitution Check gate at task review; Out of Scope list referenced in every phase |
| 9 | SEO duplicate/conflicting locale URLs | Mandatory hreflang + canonical discipline; slug uniqueness enforced by DB partial unique indexes |
| 10 | Backup exists but restore never proven | Restore drill is an explicit pre-launch gate with recorded evidence (SC-015) |
| 11 | Approved asset alteration during optimization | Originals copied hash-verified; `next/image` renditions derived without filters/recoloring; checklist item "no logo replacement" in design QA |
| 12 | Greenfield stack churn (framework major versions) | Versions pinned via lockfile; dependency updates only in dedicated PRs with full CI; guidance from `vercel-react-best-practices` skill |

## Complexity Tracking

No Constitution Check violations exist, so no entries are required. (This section intentionally left without rows.)

## Post-Design Constitution Re-Check (after Phase 1 artifacts)

Re-evaluated after `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` were produced:

- MVP boundary: unchanged — no excluded capability appears in contracts or data model; lead APIs are create/status/read only (no notification or CRM fields); no analytics/tracking tables.
- Data governed: seed script limited to approved profile content with source references; no coordinates, statistics, or lists invented; "50 years" remains unrenderable until approved.
- Bilingual: locale routing, per-language columns, and localized contracts (error messages by locale) confirmed end-to-end in `quickstart.md`.
- Design system: asset-copy step in quickstart verifies SHA-256 equality of `docs/logo.png`/`hero.png` against `public/` copies.
- Security: every admin endpoint in `contracts/admin-api.md` names its required permission; consent required on both public lead endpoints.
- Traceability: contract endpoints map to FR-015–FR-019, FR-020–FR-035; data-model entities map to spec Key Entities; quickstart scenarios map to SC-001–SC-015.

**Post-Phase-1 gate verdict: PASS — zero violations; plan remains implementation-free (no code, no tasks).**
