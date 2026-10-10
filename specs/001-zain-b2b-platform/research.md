# Phase 0 — Research & Technical Decisions

**Feature**: 001-zain-b2b-platform | **Date**: 2026-10-07 | **Inputs**: `spec.md`, `plan.md`, `docs/PROJECT_REQUIREMENTS.md` (§45–§46, §51), `docs/DESIGN_SYSTEM.md`, `docs/SPECKIT_WORKFLOW.md`, constitution gates, loaded skills (`frontend-design`, `ui-ux-pro-max`, `responsive-design`, `web-design-guidelines`, `vercel-react-best-practices`, `typescript-advanced-types`).

Each record: **Decision → Rationale → Alternatives considered (and why rejected)**. Constitution Principle X applies to every infrastructure decision: simplest thing that meets the requirement; no premature infrastructure.

Research method note: stack facts were grounded against current primary sources (Next.js release notes, Auth.js docs) on 2026-10-07; everything else is derived from the approved project documents listed above. Items marked ⚠ *client decision* are isolated behind adapters or CMS and do not block implementation.

---

## 1. Application framework

**Decision**: Next.js 16.x, App Router, single full-stack deployable; **Cache Components enabled** (the `create-next-app` default and recommended model as of 16.4); version pinned via lockfile, minimum 16.3.8 (security patch line).

**Rationale**: Server rendering + metadata API + route segmentation is the shortest path to bilingual SEO (FR-043, SC-011) and <3s mobile (SC-009). One deployable satisfies public site + admin + API at this scale; PR §45 explicitly recommends Next.js/React + Node. Cache Components is now the default for greenfield apps; adopting it at project start avoids a later migration.

**Alternatives**: Pages Router (older model, weaker layout/segment story — rejected); Remix/Astro/SvelteKit (violates PR §45 direction and ecosystem fit — rejected); separate SPA + API server (two deployables, CORS, harder SEO — rejected by Principle X); static-site generators (no admin/dynamic API — rejected).

## 2. Language & runtime

**Decision**: TypeScript 5.x with `strict: true`, Node.js 24 LTS.

**Rationale**: PR §45 recommends TypeScript; strict mode aligns with Constitution IX (quality gates) and `typescript-advanced-types` guidance; Node LTS gives a stable base image for Docker.

**Alternatives**: JavaScript (loses type safety the contract/test layers depend on — rejected); Deno/Bun (ecosystem and hosting risk for a production B2B site — rejected by Principle X); `strict` off (contradicts quality gate — rejected).

## 3. Database & ORM

**Decision**: PostgreSQL 17+ (single primary), Prisma ORM, **Prisma Migrate** for versioned migrations, `db seed` script kept separate and idempotent.

**Rationale**: PR §45 recommends PostgreSQL/Supabase; relational fit for catalog ↔ categories ↔ brands ↔ suppliers, RBAC, leads, and slugs with uniqueness constraints (FR-036). Prisma gives type-safe queries shared with TS contracts, first-class migrations, and works with the Auth.js ecosystem. Full-text (`tsvector`) + `pg_trgm` give search without new services.

**Alternatives**: MySQL (no harm, but PG trgm/tsvector needed for search — rejected); SQLite (no concurrency/FTS parity — rejected); MongoDB (schema-less fights the governed data model — rejected); Drizzle (valid lighter ORM; Prisma chosen for migration ergonomics and docs maturity — acceptable fallback, not adopted); ORM-less SQL (too much hand-rolled mapping for the entity count — rejected); Prisma + separate read replica (no load that warrants it — Principle X).

## 4. Auth & session strategy (researched constraint)

**Decision**: Auth.js v5 (`next-auth`) with the **Credentials provider** and **`session: { strategy: "jwt" }`** — a requirement, not a preference: the Credentials provider does not create database sessions and cannot be used with the database strategy. Architecture compensates for everything JWT normally costs:

- **Identity-only token**: the cookie carries the user id + `tokenVersion` (+ minimal profile); **no role or permission claims are trusted from the token**.
- **Per-request DB authorization**: every admin request resolves the user row and current role from PostgreSQL, so role change / deactivation apply on the next action (US12.4) regardless of token lifetime.
- **Revocation**: `tokenVersion` column on `User`; password change or account deactivation bumps it, and any token with a stale version is rejected (immediate global logout).
- **Split config**: `auth.config.ts` (edge-safe, no adapter) for middleware + `auth.ts` (Node) exporting `auth/handlers/signIn/signOut`, per Auth.js v5 best practice. Env vars prefixed `AUTH_*` (`AUTH_SECRET`, `AUTH_TRUST_HOST` behind proxy).
- Password hashing: **argon2id** via `@node-rs/argon2` (prebuilt binaries, memory-hard, modern default over bcrypt).

**Rationale**: PR §45 explicitly allows "secure session/JWT strategy". The DB-per-request pattern gives the revocation semantics of database sessions while satisfying the framework constraint; `tokenVersion` closes the force-logout gap. Foundation-time choice avoids a security rewrite later.

**Alternatives**: *Credentials + database sessions* — **impossible** (framework constraint; the most common Auth.js misconfiguration, producing "logged in but not logged in"); *custom session table + own cookie code* (full control but hand-rolled CSRF/expiry/rotation — more security surface than it removes — rejected); *JWT with role claims and no DB check* (violates US12.4 — rejected); *OAuth/OIDC or SSO* (no identity provider requirement in spec — rejected); *Better Auth / Lucia / Clerk* (viable; Auth.js chosen for maturity and PR alignment — acceptable fallback); *2FA* (no requirement; not MVP — noted as possible future item, not designed).

## 5. RBAC

**Decision**: Fixed `role` enum on `User` (Super Admin, Content Manager, Product Manager, Sales/Business — FR-021) + a **code-defined permission matrix** mapping role → `resource:action` permissions, enforced by `requirePermission()` inside services/route handlers; matrix asserted exhaustively by unit tests (SC-004).

**Rationale**: "basic RBAC" (PR §47), 4 roles only; a code matrix is reviewable, testable, and needs no DB table churn; server-side enforcement satisfies FR-022; middleware only provides UX-level gating.

**Alternatives**: Casl/OPA-style libraries (overhead for 4 fixed roles — Principle X); DB-stored role-permission rows (runtime-flexible but adds admin UI + migration churn not required — rejected); per-endpoint ad-hoc checks (untestable as a matrix — rejected).

## 6. API style & boundaries

**Decision**: REST route handlers under `src/app/api`, documented in `contracts/` (README + public + admin). Public: `POST /api/inquiries`, `POST /api/partnerships`, `GET /api/search`. Admin: module CRUD, publish/preview, lead status transitions, media upload, CMS draft/publish, SEO, users, settings, activity log, dashboard, `GET /api/search` reuse. Server components read via **services directly** (no internal HTTP hop).

**Rationale**: PR §45 requires a REST API; explicit contracts make `/speckit.tasks` decomposition and Playwright API tests concrete; skipping internal HTTP for RSC reads avoids latency the user never benefits from.

**Alternatives**: GraphQL (schema tooling + cache complexity with no client consuming it — rejected); tRPC (not "REST" per PR §45; couples contract to TS — rejected); server actions everywhere (no versioned, testable HTTP contract for external/consumer use — rejected for mutations); BFF-for-everything (internal hops — rejected).

## 7. i18n, RTL & locale routing

**Decision**: `next-intl` with `/[locale]` segment (`/en/...`, `/ar/...`), locale middleware (detect → persist → never lose current location on switch, FR-001); `messages/en.json` + `messages/ar.json` for UI chrome; **per-language DB columns** for queryable text (`name_en/name_ar`, `slug_en/slug_ar`, meta fields) and **JSON payloads per locale** for CMS sections; **CSS logical properties only** (`margin-inline`, `padding-inline-start`, `inset-inline`, `text-align: start` + Tailwind logical utilities); fonts via `next/font`.

**Rationale**: FR-001–FR-004 + Constitution VI ("bilingual from the foundation"). Per-language columns allow SQL-level filtering, uniqueness (FR-036) and indexing; JSON fits typed CMS section payloads; logical properties make **one** layout serve both directions (responsive-design + web-design-guidelines skills), verified by Playwright in both locales (SC-001, SC-008).

**Alternatives**: `next-intl` messages-only with translated DB rows (needs join/JSON query per read — worse indexes; rejected); single content column with sidecar translation table (more joins, noisier contracts — rejected); duplicated per-locale route trees (maintenance ×2 — rejected); CSS `direction: rtl` overrides with physical properties (classic regression source — rejected by Constitution VI); `i18next`/`react-intl` directly (next-intl is the App Router-native choice — acceptable alternatives, not adopted).

## 8. Search

**Decision**: PostgreSQL-native: generated `search_document` column per searchable entity (both locales' name/summary text), `tsvector('simple')` GIN index (language-neutral — Arabic stemming support in PG is weak, so `simple` + normalization beats a half-working stemmer) + `pg_trgm` GIN on slugged names for partial/prefix matching; one `GET /api/search` querying products/brands/suppliers/categories with localized result labels, published-only predicate, offset pagination.

**Rationale**: FR-015 + SC-006 (<1s perceived) are comfortably met at hundreds–low-thousands of rows; zero new infrastructure (Principle X); `pg_trgm` covers Arabic/CamelCase/partial matching where trigrams beat token search.

**Alternatives**: Meilisearch/Elasticsearch/OpenSearch (second service to deploy, sync, and back up — premature at this scale, rejected by Principle X; documented in Risk 1 as a future migration path); `websearch_to_tsquery` with `arabic` config (stemming quality is the problem being avoided — rejected); client-side fuzzy search over a JSON dump (breaks SEO/discoverability for catalog scale — rejected); DB `ILIKE '%q%'` only (too weak alone for mixed-script matching — rejected as sole strategy).

## 9. CMS (structured, not a page builder)

**Decision**: `cms_sections(section_key, locale, draft_content JSONB, published_content JSONB, version, updatedBy, publishedAt)` with a **fixed registry of section keys** (Home, About, Contact) and per-section **Zod-typed field schemas**; editing writes draft only; Publish copies draft → published + tag invalidation. Statistics fields carry an `approved` flag (FR-007); unrendered "50 years" withheld (Assumptions/Open Item).

**Rationale**: FR-032 + Constitution IV: typed fields mean there is *structurally no* arbitrary markup/layout injection path; draft/published split is the publish-safety mechanism (US6, Risk 7).

**Alternatives**: Page builders (ProseMirror/Liveblocks-style arbitrary blocks — forbidden by Constitution IV); headless CMS SaaS (Sanity/Strapi/Contentful — external dependency + cost + auth surface for a fixed three-section site — rejected by Principle X); raw HTML fields (XSS + no design-system guarantee — rejected); per-component tables (row explosion — rejected).

## 10. Media & storage

**Decision**: `MediaStorage` interface with S3-compatible driver (MinIO in local compose, any S3-compatible endpoint in production); server-mediated multipart upload with MIME allowlist (png/jpg/webp/avif; pdf/doc/docx), magic-byte sniffing, size caps (images ≤10 MB, documents ≤20 MB — plan-level defaults), randomized storage keys, non-executable bucket, downloads with safe `Content-Disposition`; usage resolved by FK references from entities (no usage-mirror table).

**Rationale**: PR §45 ("S3-compatible/Supabase"); FR-033 secure uploads; interface keeps the client's storage decision swappable (Open Item 7 adjacency — hosting/provider confirmation, plan: adapter isolates it).

**Alternatives**: Storing files on local disk in the container (lost on redeploy — rejected); direct-to-S3 presigned uploads from browser (extra CORS + client trust surface for a small admin team — acceptable future optimization, rejected for MVP); Cloudinary/Imginary-style SaaS (external cost/dependency — rejected by Principle X); media *usage* table (sync drift risk; FK references are simpler and authoritative — rejected).

## 11. Maps & geographic presence

**Decision**: Provider-neutral `MapSection` adapter component; **Leaflet + OpenStreetMap** tiles as the default implementation (open, no key, works in every environment); coordinates rendered **only** from verified `Location` rows (`isVerified = true`), otherwise a text address fallback.

**Rationale**: PR §45 lists Google/Mapbox "to evaluate" and map provider remains Open Item 7 ⚠; the adapter makes swapping providers a one-file change; FR-013 + Assumptions forbid invented coordinates.

**Alternatives**: Google Maps (key, billing, ToS — pending client decision, isolated); Mapbox (key/billing — same); SSR-rendered map (heavy, needs hydration — rejected); static map images (no interaction — fallback for no-JS, considered in implementation).

## 12. Optimistic concurrency

**Decision**: Every editable entity carries an integer `version`; updates require `If-Match: <version>` (or body `version`), enforced with `WHERE id = ? AND version = ?` → mismatch returns **409 `VERSION_CONFLICT`** with localized message; UI offers reload.

**Rationale**: Spec edge case explicitly defers the approach to planning — decided here; closes the concurrent-admin-edit risk (Risk 5) with one column and no infra.

**Alternatives**: Last-write-wins (silent data loss — rejected); row-level `SELECT ... FOR UPDATE` transactions everywhere (heavier, still needs a user-facing conflict signal — rejected as sole mechanism); ETags per resource (duplicates `version` semantics — rejected).

## 13. Rate limiting & login throttling

**Decision**: **Postgres-backed fixed-window counters** table (`RateLimitCounter`) for public endpoints (inquiries, partnerships, search) — survives restarts, queryable, no new service; **in-process sliding counters** for login attempt throttling (per account + IP) with lockout and localized feedback (US3.4), since login state is per-instance and short-lived.

**Rationale**: FR-019 + US3.4; Principle X forbids adding Redis for two low-QPS surfaces.

**Alternatives**: Redis (second datastore + backup surface — rejected by Principle X); in-memory only for everything (resets on redeploy — rejected for public forms); gateway/WAF rate limiting (hosting-dependent — complementary, not relied upon); no limiting (violates FR-019).

## 14. Forms & validation

**Decision**: Shared **Zod schemas** in `src/server/validation` imported by both client forms (UX feedback) and route handlers (enforcement — validation runs twice by design); localized error map keyed by Zod issue code → `messages/{locale}.json` string (FR-003); consent checkbox required on both lead forms, linked to privacy notice (Clarification 1); `role="alert"` inline errors + error-summary focus (ui-ux-pro-max/web-design-guidelines).

**Rationale**: Single source of validation truth prevents client/server drift; localization of messages is an FR.

**Alternatives**: Server-only validation (poor UX, no i18n on first submit — rejected); React Hook Form + Zod (adopted at implementation for complex admin forms; the contract is the schema either way); HTML `required` only (insufficient, not localized — rejected as sole mechanism).

## 15. Motion, design tokens & fonts

**Decision**: Tailwind CSS with tokens transcribed 1:1 from `docs/DESIGN_SYSTEM.md` (palette, type scale, spacing, radius, shadows); **Framer Motion** limited to entrance/hero/overlay transitions, all gated by `prefers-reduced-motion`; fonts self-hosted via `next/font`: Cormorant Garamond (display EN), Manrope (UI EN), Amiri (display AR), IBM Plex Sans Arabic (UI AR); approved `docs/logo.png` / `docs/hero.png` copied byte-identical (SHA-256 verified) into `public/`, never regenerated.

**Rationale**: Constitution XIII (design-system fidelity) + DESIGN_SYSTEM §8/§15; `next/font` prevents CLS (FR-042, SC-009); reduced-motion is an FR-040 requirement.

**Alternatives**: CSS-only transitions (Framer Motion kept *restrained* but useful for orchestrated entrances — acceptable simplification if bundle budget is hit); styled-components/CSS-in-JS (runtime cost, RSC friction — rejected); Google Fonts CDN at runtime (CLS + privacy + availability — rejected); re-creating logo via `next/image` tricks (forbidden — assets are byte-identical).

## 16. SEO

**Decision**: Per-locale `generateMetadata` (title, description, canonical, OG image, `hreflang` alternates); `SeoMeta` rows per (entity, locale) with localized defaults fallback (US10.2); slug uniqueness per (entity type, locale) via **partial unique indexes** (FR-036); `SlugRedirect` rows on slug change → HTTP 301 (US10.3); generated `sitemap.xml` + `robots.txt`; clean `/brands/{slug}`-style URLs (FR-042).

**Rationale**: FR-034, FR-043, SC-011 are explicit; redirects preserve link equity across slug edits.

**Alternatives**: Client-side meta injection (bad for crawlers — rejected); one global slug space for both locales (breaks locale-tailored slugs — rejected); middleware 301 chains for old slugs (DB-backed redirects are auditable — rejected alternative).

## 17. Testing strategy

**Decision**: **Vitest** for unit (schemas, permission matrix, slug/search helpers, i18n fallback) and integration (services + REST handlers against **ephemeral PostgreSQL** per run); **Playwright** for E2E mapped 1:1 to SC-001–SC-008 + admin RBAC matrix across the four roles, both locales, four viewports, `@axe-core/playwright` scans; `tsc --noEmit` + ESLint + production build as CI gates; rendered-page verification during implementation via the `browser-automation` skill (Constitution XIV).

**Rationale**: Constitution IX (quality is part of done) + SC-004/SC-007/SC-008 need automated proof; ephemeral-DB integration catches migration drift (Migration Strategy).

**Alternatives**: Jest (Vitest is faster, native ESM/TS — Jest acceptable, not adopted); Cypress (Playwright covers multi-browser/locale E2E with less config — rejected); manual-only QA (violates SC gates — rejected); snapshot-heavy UI tests (brittle across locales — rejected in favor of scenario assertions).

## 18. Deployment & hosting

**Decision**: Multi-stage Dockerfile → standalone Next.js production container; **Docker Compose** stack on a Linux **VPS/cloud host**: app + **Caddy** (automatic HTTPS) + PostgreSQL (volume or managed) + S3-compatible media; env-file secrets; GitHub-Actions-style CI (lint → typecheck → unit → integration → build → E2E). Hosting provider ⚠ remains client-confirmed (Open Item 7); containerization makes the target a non-event.

**Rationale**: PR §45 (VPS/cloud); one compose file keeps ops simple (Principle X); Caddy removes hand-managed cert renewals.

**Alternatives**: Vercel/Netlify (PR prefers VPS/cloud self-host; DB/media coupling and cost — acceptable if client chooses, container portability preserved); Kubernetes/ECS (absurd at this scale — rejected); systemd-only bare Node (loses parity/rollback ease — rejected); Nginx (works; Caddy chosen for auto-TLS simplicity — acceptable alternative).

## 19. Backup, restore & migration safety (FR-046, SC-015)

**Decision**: Nightly `pg_dump -Fc` to off-host storage (media bucket), 30-day retention + weekly dump-integrity check; media bucket versioning (or daily mirror); **documented restore drill as a pre-launch gate** (restore into clean instance → boot app → spot-check published content + media references → record evidence); backup taken before every production migration apply; forward-fix migration policy.

**Rationale**: Clarification 4 + FR-046/SC-015 make backups/recovery a *quality gate of the feature*, not ops afterthought (WORKFLOW Quality #44–45).

**Alternatives**: Provider snapshots only (unverified, may exclude media — rejected as sole mechanism); pgBarman/WAL shipping (overkill for one primary — Principle X; viable future upgrade); no drill (explicitly violates SC-015).

## 20. Observability

**Decision**: `pino` structured JSON logs (request id, env-configured level) + container log rotation + `GET /api/health` (DB ping) for uptime checks; product-level `ActivityLog` append-only table for the FR-035 audit trail; localized public error pages.

**Rationale**: Enough operational visibility for a single-container app without third-party APM (Clarifications exclude visitor analytics; APM is optional ops tooling — Principle X).

**Alternatives**: Sentry/Datadog (cost + approval surface; can be added later without architecture change — rejected for MVP); `console.log` (not structured — rejected); no health endpoint (needed by uptime checks — rejected).

## 21. Explicit non-decisions (MVP-excluded, Constitution II)

No checkout/payment/pricing/cart, customer accounts, ordering, CRM pipeline beyond lead status, ERP integration, outbound notifications (admin queue only — Clarification 1), visitor analytics (Clarification 5), page builder, multi-tenancy, i18n beyond en/ar, or vendor-managed content APIs. Any appearance of these in tasks will be rejected at the task-review gate.

---

## Open client-confirmation items carried forward (⚠)

From spec Open Items — not decided here, isolated so no rework follows confirmation: English company-name variants; tagline; proposal PDF absence; final brand/supplier/client lists; "50 years" claim approval; privacy-notice content (**blocking** for both lead forms — Clarification 2); map provider; hosting provider. See `spec.md` for full list.
