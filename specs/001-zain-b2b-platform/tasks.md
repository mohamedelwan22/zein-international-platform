---

description: "Implementation task breakdown for the Zain International Trading B2B Distribution & Import Platform MVP"

---

# Tasks: Zain International Trading B2B Distribution & Import Platform (MVP)

**Input**: Design documents from `/specs/001-zain-b2b-platform/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md (user stories), research.md, data-model.md, contracts/

**Tests**: Tests ARE requested — FR-045 ("Every feature MUST be delivered with tests or appropriate verification covering its acceptance scenarios") plus explicit unit/integration/E2E requirements. Within each user-story phase, test tasks appear BEFORE implementation and must fail first.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently. Story phases are ordered by priority from spec.md (P1 → P2 → P3; ties keep spec numbering with media-availability ordering: US5, US6, US12, US7, US8 then US9, US10, US11 — US12 precedes US7 because US7 admin forms attach media via the US12 upload/picker).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: `[USn]` label for user-story phases; none for Setup/Foundational/Polish
- Include exact file paths in descriptions
- Where a field constraint exists, the constraint is quoted verbatim from `data-model.md` / `contracts/` and must not be decided at implementation time.
- MVP exclusions (spec "Out of Scope") MUST NOT appear: checkout/payment/pricing/stock/cart/ordering, customer accounts/portal/quotations, CRM/ERP integrations, visual page builder, outbound notifications, visitor analytics, unapproved facts.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize git repository at repo root on branch `001-zain-b2b-platform` (`git init -b 001-zain-b2b-platform`); create `.gitignore` covering `node_modules/`, `.next/`, `coverage/`, `.env*`, `test-results/`, `playwright-report/`; no remote config changes
- [x] T002 Scaffold Next.js 16 project at repo root with `create-next-app` defaults (TypeScript, ESLint, Tailwind CSS, App Router, Cache Components enabled, `src/` directory, import alias `@/*`); remove demo boilerplate (default page/styles) but keep generated `AGENTS.md`
- [x] T003 [P] Install and pin runtime dependencies with pnpm: `next` ≥16.3.8, `react`/`react-dom`, `prisma`/`@prisma/client`, `zod`, `next-intl`, `pino`, `framer-motion`, `@node-rs/argon2`, `next-auth@beta`, S3 client for MinIO compatibility; dev deps: `vitest`, `@playwright/test`, `@axe-core/playwright`, `eslint-config-next`, `typescript`, `tailwindcss`; commit `pnpm-lock.yaml`
- [x] T004 [P] Configure Vitest in `vitest.config.ts` with projects for `tests/unit` and `tests/integration`; integration project must boot against an ephemeral PostgreSQL (fresh DB per run, migrations applied) per `quickstart.md` §4
- [x] T005 [P] Configure Playwright in `playwright.config.ts` (webServer `pnpm dev` on localhost:3000, projects for desktop/laptop/tablet/mobile viewports, screenshot-on-failure); add `@axe-core/playwright` scan helper
- [x] T006 [P] Add `package.json` script suite matching `quickstart.md` §4: `typecheck`, `lint`, `test:unit`, `test:integration`, `test:e2e`, `build`, `db:migrate` (dev/prod), `db:seed`, `dev`
- [x] T007 [P] Create `docker/compose.yaml` dev stack: `postgres:17` (db/user/pass `zein` per `quickstart.md` §2 defaults) and MinIO (endpoint localhost:9000, console 9001, bucket `zein-media` auto-created with versioning enabled per FR-046)
- [x] T008 Create `src/lib/env.ts`: Zod-parsed environment covering every `quickstart.md` §2 variable (`DATABASE_URL`, `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_REGION`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `NEXT_PUBLIC_SITE_URL`, `MAP_PROVIDER`/`MAP_TOKEN`, `LOG_LEVEL`, and bootstrap admin credentials); fail fast with clear message; never log secrets
- [x] T009 Create `.env.example` documenting every `quickstart.md` §2 variable with its dev default; ensure `.env*` is gitignored
- [x] T010 Create `src/lib/logger.ts`: pino structured JSON logger with request-id field and level from `LOG_LEVEL` (plan Observability/Logging)
- [x] T011 Create `src/server/http/errors.ts`: error envelope + status codes exactly per `contracts/README.md` §4 table — `VALIDATION_FAILED` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VERSION_CONFLICT` 409, `SLUG_CONFLICT` 409, `RATE_LIMITED` 429, `PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `INTERNAL` 500 — with localized `message` support (FR-003)
- [x] T012 Create `src/app/api/health/route.ts` per `contracts/README.md` §10: `200 { status: "ok", db: "up" }` on DB ping, else `503`

**Checkpoint**: Toolchain, env, observability, and health endpoint runnable; `pnpm typecheck && pnpm lint && pnpm dev` succeed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. **No user-story work begins until this phase is complete.**

### Scaffold & Data Layer

- [x] T013 Define the full domain in `prisma/schema.prisma`: every entity from `data-model.md` §2 (User, Category, Brand, Product, ProductImage join, Supplier, Client, Location, CmsSection, Media, SeoMeta, SlugRedirect, Inquiry, PartnershipRequest, Settings, ActivityLog, RateLimitCounter, AuthAttempt) plus enums (role, kind, status, locale, action, targetType) and category junctions (BrandCategory, ProductCategory, SupplierCategory) with constraints quoted verbatim from `data-model.md`, e.g. User role "enum `SuperAdmin | ContentManager | ProductManager | SalesBusiness`", "Product.brandId FK → Brand **required** (cardinality #1, RESTRICT)", "Product.supplierId optional, `SET NULL`", Inquiry "consentAccepted **must be true**", "status enum `new | contacted | inProgress | closed`", Media "images ≤ 10 MB, documents ≤ 20 MB", "CmsSection UNIQUE (section_key, locale)", activity actions superset from `data-model.md` §2.15; include the fields added in the consistency pass: Inquiry `type` (enum) + `subject`, Product `countryOfOrigin`, Brand `history`/`distributionInfo`, Supplier `originCountry`/`coverMediaId`/`history`, Client `location`/`website` — per `data-model.md` §2.3–2.6/§2.12
- [x] T014 Generate the initial Prisma migration with `pnpm db:migrate dev --name init` and commit it; add partial unique indexes for per-locale slugs "unique per (kind, locale) via partial unique indexes (FR-036)" per `data-model.md` §6
- [x] T015 Create `prisma/seed.ts` (idempotent, re-runnable, separate from migrations) loading **only approved profile content** with a `sourceDoc` reference on each row (SC-010): the five initial categories per spec Key Entities ("personal care & cosmetic accessories, baby supplies, sports corsets & belts, compresses & quick treatment, additional personal-care products"), `Settings` contact_info (address "Jeddah, Aziziyah District, 23337 King Fahd Road", phones "0126747594 and 0126747595", "ahmed@zainagency.com", "Zainagency.com"), mission/vision and the seven approved values, approved About/Story/History/Profile/Journey/Mission/Vision/Sustainability/Innovation copy from `docs/PROJECT_REQUIREMENTS.md`; **no coordinates, no "50 years" counter, no invented brands/products/suppliers/clients** (`data-model.md` §8, Constitution III, FR-037); add `pnpm db:seed` script

### Auth & RBAC Foundation

- [x] T016 [P] Auth foundation: `src/server/auth/auth.config.ts` (edge-safe, no adapter) and `src/server/auth/auth.ts` exporting `auth`/`handlers`/`signIn`/`signOut` with the Credentials provider and `session: { strategy: "jwt" }` — **required by the Credentials provider** (`research.md` §4); argon2id password verify via `@node-rs/argon2`; token is identity-only, no role claims trusted; record every attempt (success/failure/lockout) in `AuthAttempt` with hashed IP per `data-model.md` §2.16 (US3.4)
- [x] T017 [P] Implement the permission matrix in `src/server/auth/permissions.ts`: role → `resource:action` map for exactly four roles per FR-021 and `contracts/admin-api.md` §roles (Super Admin all; Content Manager cms/media/seo/settings [+catalog read]; Product Manager brands/products/categories/media:upload; Sales/Business clients/inquiries/partnerships/media:upload; supplier/admin-locations per the matrix file's documented decisions); single source of truth for auth + menu + tests (SC-004)
- [x] T018 [P] Implement authorization in `src/server/auth/authorize.ts`: `requirePermission(resource, action)` loads the user row (role, `active`, `tokenVersion`) from the database on **every** request (US12.4), returns 401 on stale `tokenVersion`, 403 on missing permission (FR-022); provide `getSessionUser()`
- [x] T019 Create `src/server/http/rateLimit.ts`: PostgreSQL-backed fixed-window counter via `RateLimitCounter` with `contracts/README.md` §7 limits (inquiries/partnerships 5 per 10 min per IP+email; search 30 per min per IP) and in-process login throttle "5 / 15 min / account+IP" then lockout (US3.4); return `429 RATE_LIMITED` + `Retry-After`

### i18n / RTL / Design Foundation

- [x] T020 [P] i18n foundation: create `src/i18n/routing.ts` (locales `['en','ar']`, default `en`), `src/i18n/request.ts` (messages per locale), `src/i18n/navigation.ts` (Link/useRouter/redirect wrappers), `next-intl` plugin in `next.config`
- [x] T021 [P] Create `src/app/[locale]/layout.tsx` and the middleware/proxy file (pin the exact filename — `middleware.ts` or `proxy.ts` — against create-next-app's generated `AGENTS.md` at T002): locale detection → redirect/persist choice preserving current location (FR-001), `<html lang dir>` per locale, and a UX-level `/admin` gate using the edge-safe `auth.config` (authorization itself stays in `requirePermission`, FR-022) — *pinned as `src/proxy.ts` per Next.js 16 (middleware convention deprecated/renamed to proxy)*
- [x] T022 [P] Fonts + tokens: load via `next/font` "Cormorant Garamond (display), Manrope (Latin UI), Amiri (Arabic display), IBM Plex Sans Arabic (Arabic UI)" (plan decision); transcribe `docs/DESIGN_SYSTEM.md` tokens (palette, typography, spacing, radius, shadows) 1:1 into `globals.css` / Tailwind theme — **no invented values**; establish CSS-logical-properties-only baseline (`margin-inline`, `padding-inline-start`, `inset-inline`, `text-align: start` + Tailwind logical utilities, plan i18n/RTL Approach) — *flag: DESIGN_SYSTEM.md defines no shadow tokens; none invented (Constitution XIII)*
- [x] T023 [P] Create `src/i18n/messages/en.json` and `messages/ar.json` with the full UI-chrome key set (nav, language switch, form labels, validation/error/success/empty-state keys) — keys must match exactly across locales (FR-003, tests T027 enforce parity)
- [x] T024 [P] Media storage foundation: `src/server/storage/types.ts` (MediaStorage interface), `src/server/storage/s3.ts` (S3-compatible driver from env; MinIO at `S3_ENDPOINT` in dev), `src/server/storage/config.ts` — provider-swap isolated per plan Media Architecture
- [x] T025 [P] Create `src/server/storage/validate.ts`: upload allowlist "png, jpg, webp, avif; pdf/doc/docx", magic-byte sniffing, size caps "images ≤ 10 MB, documents ≤ 20 MB" (`data-model.md` §2.9), randomized storage keys (FR-033)
- [x] T026 Approved assets: copy `docs/logo.png` and `docs/hero.png` **byte-identical** into `public/`; add a verification script + unit test asserting SHA-256 equality of both copies (never regenerated, recolored, filtered, or distorted — Constitution XIII, US12.3)

**Checkpoint**: Foundation ready — schema+migration+seed, auth/RBAC, rate limiting, i18n/RTL+fonts+tokens, media layer, approved assets. User-story work may begin in parallel.

---

## Phase 3: User Story 1 - Discover the company on a bilingual public website (Priority: P1) **MVP**

**Goal**: Public Home + About experiences in Arabic (RTL) and English rendered from approved company-profile content via CMS/Settings, with language switch, responsive recomposition, and accessibility baseline.

**Independent Test** (spec): "Load the public Home and About experiences in Arabic and English using only approved company-profile content, with no admin data entry required beyond initial approved content."

### Tests for User Story 1 (write FIRST, verify they FAIL)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T027 [P] [US1] Unit test `tests/unit/i18n.test.ts`: message-key parity between `en.json`/`ar.json` (same keys, non-empty), and locale fallback — "a localized field has no Arabic or English value → the active-language view falls back to the available approved variant (or hides the optional element) without layout breakage; flagged for staff" (spec Edge Cases) — *pulled forward with the T020/T023 foundation it verifies (`src/i18n/localized.ts` helper)*
- [x] T028 [P] [US1] Integration test `tests/integration/public-content.test.ts`: published `CmsSection`/`Settings` reads return approved seeded content; unpublished sections return null; homepage statistics render ONLY when `approved` true (FR-007) — "unapproved claims (including the '50 years of success' wording) MUST NOT be rendered as factual counters"
- [x] T029 [P] [US1] E2E test `tests/e2e/us1-public-site.spec.ts`: SC-001 language switch in one action with full localized render and correct RTL `dir`; axe scan on Home/About (SC-007); four viewports with zero horizontal scrolling (SC-008); Lighthouse budget on Home (SC-009 CLS < 0.1)

### Implementation for User Story 1

- [x] T030 [P] [US1] Create per-section Zod schemas in `src/server/validation/cms.ts` (fixed registry `home|about|contact`, typed fields only — reused by US6) and implement `src/server/services/cms.ts` `getPublishedSection(sectionKey, locale)` reading `published_content` only (publication predicate, publish-safety)
- [x] T031 [P] [US1] Implement `src/server/services/settings.ts`: `getSettings(key, locale)` for contact_info/social_links/working_hours/privacy_notice (approved data only, FR-014)
- [x] T032 [P] [US1] Implement `src/server/services/content.ts`: published bilingual values/mission/vision/profile helpers sourced entirely from CMS sections + Settings — "business copy MUST be editable as bilingual CMS content and MUST NOT be hardcoded in interface components" (FR-038)
- [x] T033 [US1] Build public shell `src/app/[locale]/(site)/layout.tsx`: Navbar (logo from `/public/logo.png` via `next/image`, nav links, active state), Footer (contact from Settings, approved facts only), `src/components/site/language-switch.tsx` preserving current path, skip link, semantic landmarks (FR-040); add `src/app/[locale]/not-found.tsx` (localized 404 reusing the public shell + message keys, FR-039) + `[...rest]` catch-all so unmatched routes render the localized boundary
- [x] T034 [P] [US1] Home route `src/app/[locale]/(site)/page.tsx`: CMS hero (logo, primary headline, supporting statement, primary/secondary CTAs, premium visual from approved `/public/hero.png`), company preview, approved categories preview with localized empty state, geographic-presence teaser (approved wording only, FR-013), approved Mission/Vision, closing CTAs to Contact/inquiry/partnership; statistics gated by `approved` flag (FR-007)
- [x] T035 [P] [US1] About group `src/app/[locale]/(site)/about/page.tsx` rendering Our Story, Our History, Profile, Journey Towards Excellence, Mission, Vision, Values (seven approved), Sustainability, Innovation from the CMS about section (incl. "1394 AH" founding reference, FR-005); plus `/values`, `/sustainability`, `/innovation` routes
- [x] T036 [P] [US1] Contact info route `src/app/[locale]/(site)/contact/page.tsx` presenting approved contact details from Settings (FR-014); page owner of the inquiry form mounted in US4
- [x] T037 [US1] Base SEO on public routes: per-locale `generateMetadata` with localized defaults derived from approved content (US10.2 fallback behavior), `hreflang` alternates en/ar, canonical, OG image using approved asset (FR-043 foundation; full SEO admin in US10)
- [x] T038 [US1] Mixed-script/RTL QA task: verify Arabic pages containing Latin brand names/phone numbers/addresses (ep "Jeddah, Aziziyah District, 23337 King Fahd Road" inside Arabic) render with correct direction, no overlap/overflow (spec SC-1.2, edge case) — implementation must use only logical properties — *verified: logical-properties-only baseline, `dir="ltr"` isolation for phones, E2E zero-overflow pass on ar routes*

**Checkpoint**: US1 fully functional — Home/About in en+ar from approved content, switch/RTL/responsive/a11y tests green.

---

## Phase 4: User Story 2 - Discover brands and products (Priority: P1)

**Goal**: Brands directory + informational product catalog with brand/category/country filters and detail pages, all published-only, with inquiry CTA.

**Independent Test** (spec): "Browse the brands directory and product catalog, open a brand and a product detail page, apply and clear filters, and reach the inquiry call to action using only approved initial catalog content."

### Tests for User Story 2 (write FIRST, verify they FAIL)

- [x] T039 [P] [US2] Integration test `tests/integration/catalog-read.test.ts`: publication predicate "status = 'published' AND isActive = true" enforced (archived/inactive/unapproved never returned — FR-008 scenario 4, edge case "Archived referenced records"); combined brand/category/country filters; clear-filters resets; zero-record catalog → localized empty state, never a blank page
- [x] T040 [P] [US2] E2E test `tests/e2e/us2-brands-catalog.spec.ts`: SC-002 journey "home → catalog → detail" in ≤3 interactions plus inquiry CTA reachable; brand directory/detail fields; filters preserve language selection; assert product pages contain NO price/stock/cart/checkout/ordering/rating/review/e-commerce tokens (FR-010); may run against **placeholder** fixtures derived from the approved product concept (flagged non-published — Constitution III; never invented facts) so the SC-002 happy path is executable; keep the zero-catalog empty-state assertion

### Implementation for User Story 2

- [x] T041 [US2] Implement `src/server/services/catalog.ts`: `listPublishedBrands`/`listPublishedProducts` with filters (brand, category, country-of-origin — individual and combined; `countryOfOrigin` per `data-model.md` §2.4), `productDetail` (brand, categories, images, specifications, related products/brand, optional SKU/reference/brochure), brand detail; all reads published-only; slug resolution honors `SlugRedirect` (US10.3 behavior) via `src/server/services/redirects.ts`
- [x] T042 [US2] Brands routes `src/app/[locale]/(site)/brands/page.tsx` + `.../brands/[slug]/page.tsx`: logo, cover, country, category, short description, featured flag (FR-008); detail shows about/history/distribution, related products, inquiry CTA
- [x] T043 [US2] Products routes `src/app/[locale]/(site)/products/page.tsx` + `.../products/[slug]/page.tsx`: filter sidebar (brand/category/country, combined, clearable, locale-preserving), list + detail (bilingual name, brand, category, country of origin, images, short/full description, specifications, related products + brand, inquiry CTA) — FR-009; renders no price/stock/cart/rating UI anywhere (FR-010)
- [x] T044 [US2] Implement `src/server/services/categories.ts` reading published dynamic categories (`data-model.md` §2.2), shared by nav, catalog filters, and Home category preview ("categories remain fully dynamic after launch" — FR-027) — *service pulled forward into US1 (T034) to serve the Home category preview; the US2 nav/filter consumers import it as-is*

**Checkpoint**: US2 catalog fully browsable/filterable with published-only semantics; empty states and CTA verified.

---

## Phase 5: User Story 3 - Sign in securely to the Admin Dashboard with a role (Priority: P1)

**Goal**: Credentials sign-in, four-role RBAC with server-enforced permissions and immediate revocation semantics.

**Independent Test** (spec): "Sign in with accounts for each documented role and verify each role reaches only its permitted areas, and that forbidden actions are refused even when attempted directly."

### Tests for User Story 3 (write FIRST, verify they FAIL)

- [x] T045 [P] [US3] Unit test `tests/unit/permissions.test.ts`: exhaustive matrix coverage — every role enum value × every `resource:action` asserts expected allow/deny (SC-004 "100% of privileged admin operations attempted without the required permission are refused", across all four roles) — *pulled forward from Phase 5 to verify T017 (same file/spec; T046/T047 complete the US3 test set)*
- [x] T046 [P] [US3] Integration test `tests/integration/auth.test.ts`: sign-in success/failure; "5 / 15 min / account+IP" lockout with recorded event (US3.4 — `AuthAttempt` rows exist for success/failure/lockout) and localized feedback; `tokenVersion` bump invalidates existing tokens immediately (revocation); session expiry forces re-authentication; denied privileged action returns 403 and changes no data (FR-022)
- [x] T047 [P] [US3] E2E test `tests/e2e/us3-auth-rbac.spec.ts`: four role accounts each see only their modules (FR-021); direct attempts at forbidden URLs are blocked; sign-out → admin requires re-authentication

### Implementation for User Story 3

- [x] T048 [US3] Auth route handler `src/app/api/auth/[...]/route.ts` wiring the exported Auth.js handlers; sign-in/sign-out server actions in `src/server/auth/actions.ts` with localized error mapping (FR-003)
- [x] T049 [US3] Login page `src/app/[locale]/(auth)/login/page.tsx` + localized form (email/password), loading/error states (FR-039), throttled-lockout localized message per data-model §2.1 failedLogins/lockedUntil
- [x] T050 [US3] Admin shell `src/app/[locale]/(admin)/admin/layout.tsx`: server-side gate (re-auth on no session), role-scoped sidebar built FROM the permission matrix (Super Admin: everything; CM: pages/CMS/media/SEO; PM: brands/products/categories; SB: clients/inquiries/partnerships), logout control
- [x] T051 [US3] Admin landing placeholder `src/app/[locale]/(admin)/admin/page.tsx` (full dashboard in US11) as the post-login destination
- [x] T052 [US3] Session-expiry UX `src/components/admin/session-guard.tsx`: localized re-auth prompt mid-edit; unsaved draft content is never silently published (spec edge case "Session expiry mid-edit")

**Checkpoint**: US3 auth boundary live — only authenticated, permissioned users reach admin content.

---

## Phase 6: User Story 4 - Submit a business inquiry and manage it as staff (Priority: P1)

**Goal**: Public inquiry form (with mandatory consent) → stored lead with context, rate-limited; Sales/Business staff manage statuses in an admin queue.

**Independent Test** (spec): "Submit an inquiry from a product page as a visitor, then locate it in the admin queue, progress it through statuses, and confirm the record retains its contextual links."

### Tests for User Story 4 (write FIRST, verify they FAIL)

- [ ] T053 [P] [US4] Unit test `tests/unit/inquiry-schema.test.ts`: "consentAccepted **must be true**" else invalid (Clarification 2); "at least one of `email`/`phone` required" (`data-model.md` §2.12); `type` enum + required `subject` (FR-016); malformed email/phone rejected; localized issue keys (FR-003)
- [ ] T054 [P] [US4] Integration test `tests/integration/inquiries-api.test.ts` per `contracts/public-api.md`: `201` with `status: "new"` and contextual links (product/brand/supplier/source page) retained; `400` on missing/invalid inputs or `consentAccepted:false` with **no partial record**; `429 RATE_LIMITED` after 5 per 10 min/IP+email; status transitions New→Contacted→InProgress→Closed recorded with actor (SC-012)
- [ ] T055 [P] [US4] E2E test `tests/e2e/us4-inquiry.spec.ts`: SC-003 visitor completes valid inquiry in under 3 minutes with success feedback in active language; staff locates it in admin queue and progresses statuses

### Implementation for User Story 4

- [ ] T056 [US4] Implement `src/server/services/inquiries.ts`: `createInquiry` (`type` one of product/brand/supplier/distribution/partnership/general + required `subject` — FR-016 — plus contextual FKs "optional, `SET NULL`", source page, consent + `consentAt` server timestamp, status `new`, locale), `listInquiries` (status filter + pagination), `transitionStatus` (permission + ActivityLog write, `contracts/admin-api.md` §4)
- [ ] T057 [US4] Route handler `src/app/api/inquiries/route.ts` per `public-api.md` `POST /api/inquiries`: server-side Zod validation (enforces `type` enum + required `subject` per FR-016) → rate limit → persist → `201`; error envelope + localized messages (double validation by design, FR-019/FR-003)
- [ ] T058 [US4] Inquiry form `src/components/site/inquiry-form.tsx`: type (product/brand/supplier/distribution/partnership/general), name/company/email/phone/subject/message, consent checkbox linked to `Settings` privacy_notice (FR-016, Clarification 2), inline localized errors with focus to error summary (FR-040), success state; mounted on Contact and product/brand/supplier detail CTAs with context via query params
- [ ] T059 [US4] Admin inquiries queue `src/app/[locale]/(admin)/admin/inquiries/` + endpoints: list (status filter, pagination), detail with internal notes, status-change with activity logging — permission `inquiries:*` (Sales/Business, Super Admin) per `admin-api.md` §4
- [ ] T060 [US4] Privacy-notice isolation: consent copy resolves from `Settings.privacy_notice` (pending client content, Open Item 6 — never blocks code or ships a placeholder; admin surfaces a localized "content pending" flag when unset)

**Checkpoint**: US4 convert — valid/consent inquiry captured with context, rate-limited, manageable in queue.

---

## Phase 7: User Story 5 - Submit a partnership request with attachment (Priority: P2)

**Goal**: Dedicated partnership form (optional document attachment) → queue with shared status lifecycle and audited attachment access.

**Independent Test** (spec): "Submit a complete partnership request with an allowed attachment, then locate and open it in the admin queue as authorized staff."

### Tests for User Story 5 (write FIRST, verify they FAIL)

- [ ] T061 [P] [US5] Integration test `tests/integration/partnerships-api.test.ts` per `public-api.md`: `201` with `status: "new"`; disallowed attachment type → `415 UNSUPPORTED_MEDIA_TYPE`; size over "documents ≤ 20 MB" → `413 PAYLOAD_TOO_LARGE`; missing consent → `400`; staff attachment access writes an ActivityLog entry (FR-035); statuses use the same pipeline "new | contacted | inProgress | closed" (Clarification 3); `businessType` accepted per FR-018
- [ ] T062 [P] [US5] E2E test `tests/e2e/us5-partnership.spec.ts`: SC-003 partnership with attachment completes in under 5 minutes; attachment-error case shows localized file error AND "the rest of the entered data is preserved for correction" (FR-018, edge case "Attachment failures"); admin opens attachment and progresses statuses

### Implementation for User Story 5

- [ ] T063 [US5] Implement `src/server/services/partnerships.ts`: `createPartnershipRequest` (fields from FR-018 incl. `businessType` + attachment via `MediaStorage`, validated per T025 caps; reuse shared lead helpers with inquiries), list/detail, `transitionStatus` same pipeline (Clarification 3), `getAttachment` with audit (FR-035)
- [ ] T064 [US5] Handlers: `src/app/api/partnerships/route.ts` (multipart/JSON per `public-api.md`) + admin endpoints in `src/app/api/admin/partnerships/...` including attachment download with safe `Content-Type`/`Content-Disposition` (FR-033)
- [ ] T065 [US5] Partnership form `src/components/site/partnership-form.tsx` + route `src/app/[locale]/(site)/partnership/`: company name, contact person, email, phone, country, business type (`businessType` per FR-018, consistent with `data-model.md` §2.13 and `public-api.md`), website, product category, message, attachment (FR-018); consent checkbox linked to privacy notice; localized file errors; entered data preserved on file failure
- [ ] T066 [US5] Admin partnership queue `src/app/[locale]/(admin)/admin/partnerships/` + list/detail/status/attachment viewer per `contracts/admin-api.md` §4

**Checkpoint**: US5 complete — partnership channel end-to-end with audited attachments.

---

## Phase 8: User Story 6 - Edit structured content without code changes (Priority: P2)

**Goal**: Content Manager edits Home/About/Contact structured sections in both languages with draft/publish safety, previews, and guarded statistics, plus a Settings editor for contact/social/working-hours/privacy content.

**Independent Test** (spec): "As a Content Manager, edit the homepage hero, a statistic, the mission text, and contact details in both languages and confirm the public site reflects the changes."

### Tests for User Story 6 (write FIRST, verify they FAIL)

- [ ] T067 [P] [US6] Integration test `tests/integration/cms-admin.test.ts`: draft PUT never appears publicly until publish ("previewed-but-unpublished content → public visitors continue seeing the previously published version" — SC-005 publish safety); publish → public reflects + cache invalidation; unpublish clears published; `approve-stat` gates FR-007; schema rejects arbitrary markup fields (FR-032: "no free-form page builder, no arbitrary layout creation, no option to inject unrestricted markup")
- [ ] T068 [P] [US6] E2E test `tests/e2e/us6-cms.spec.ts`: SC-005 — Content Manager updates hero + a statistic + mission + contact details in both languages and sees the published result live within 5 minutes with no engineering involvement; Content Manager edits `Settings` (working hours/social links) via the admin Settings editor and the public contact page reflects it without engineering help

### Implementation for User Story 6

- [ ] T069 [US6] Finalize CMS registry + per-section Zod schemas in `src/server/validation/cms.ts`: fixed keys home/about/contact with EXACTLY the FR-032 predefined fields (hero, calls to action, statistics, about preview, featured brands/products, categories, sustainability, innovation, geographic presence, mission, vision, values, story, history, profile, journey, phone, email, address, working hours, map, social links); statistics entries carry an approved flag; no raw-HTML type exists (Constitution IV); extend to `Settings` keys (`contact_info`/`social_links`/`working_hours`/`privacy_notice`) with typed Zod schemas + `GET/PUT /api/admin/settings` endpoints per `contracts/admin-api.md` §9 (permission `settings:*` — CM/SA), satisfying FR-014 "editable through CMS/settings"
- [ ] T070 [US6] Admin CMS module `src/app/[locale]/(admin)/admin/cms/` + endpoints per `admin-api.md` §6 (GET registry, GET draft+published, PUT draft only, publish/unpublish, approve-stat) with permissions cms:read/update/publish; include the Settings editor screen wiring `settings:read/update` (`admin-api.md` §9) for contact_info/social_links/working_hours/privacy_notice — FR-014
- [ ] T071 [US6] Publish pipeline: after publish, trigger cache-tag invalidation (Cache Components tag APIs — pin the exact tag-invalidation API against the installed Next 16 at T002) for the affected public routes so published result goes live (SC-005) in `src/server/services/cms.ts`
- [ ] T072 [US6] Preview support (FR-031): draft payload rendered through the same public components with a session-scoped preview capability, never leaking to anonymous visitors

**Checkpoint**: US6 — non-engineers keep public copy current via structured CMS with publish safety.

---

## Phase 9: User Story 12 - Manage users, roles, and the media library (Priority: P2)

**Goal**: Super Admin manages staff accounts/roles (immediate effect) and a shared validated media library reused across records.

**Independent Test** (spec): "Create a user, assign a role, upload/replace/archive a media item, and use it in a brand record; revoke a role and verify access changes immediately."

> **Phase-9 note**: US12 ships BEFORE the US7 entity module (Phase 10) because US7 admin forms attach media via the US12 upload/picker. US12 depends only on auth (US3) and the media foundation (T024–T026).

### Tests for User Story 12 (write FIRST, verify they FAIL)

- [ ] T088 [P] [US12] Integration test `tests/integration/users-media.test.ts`: user create/role-assign takes effect immediately; `tokenVersion` bump on deactivation revokes access at next action (US12.4, data-model §2.1); media upload validation (allowlist + magic bytes + size caps), unauthorized upload refused, archive guarded to unreferenced items; user/permission changes activity-logged (FR-024/035)
- [ ] T089 [P] [US12] E2E test `tests/e2e/us12-users-media.spec.ts`: create user → sign in as them → revoke role → next action loses access (logged); upload/replace/archive media (verified in this phase); the "reuse in a brand record" step is asserted jointly with T076 once the US7 brand admin module lands (Phase 10) — media API + MediaPicker are already available here

### Implementation for User Story 12

- [ ] T090 [P] [US12] Users admin module `src/app/[locale]/(admin)/admin/users/` + endpoints per `admin-api.md` §8 (list, create, update, reset-password, deactivate) permissions users:*; guards "last active Super Admin cannot be deactivated or demoted; a user cannot deactivate themselves" (data-model §2.1)
- [ ] T091 [P] [US12] Media admin module `src/app/[locale]/(admin)/admin/media/` + endpoints per `admin-api.md` §5 (multipart upload with validation per T025, preview, replace, archive, purge-when-unreferenced, `alt_en`/`alt_ar`) permissions media:*; MediaPicker component for entity forms and brand/product image assignment (consumed by US7, Phase 10)
- [ ] T092 [US12] Approved-asset reuse: public nav/footer/hero and OG image use `/public/logo.png` + `/public/hero.png` via `next/image` from their actual repository locations — "never regenerated, recreated, recolored, or distorted" (FR-033, US12.3); CI re-runs the SHA-256 equality check from T026
- [ ] T093 [US12] Wire audit events for user/permission changes and sensitive attachment access into `ActivityLog` (FR-024/035) with correct `tokenVersion` handling (changes apply at next request, US12.4)

**Checkpoint**: US12 — access stays current and media is validated, reusable, and audited.

---

## Phase 10: User Story 7 - Manage catalog and directory entities from the Admin Dashboard (Priority: P2)

**Goal**: Full bilingual CRUD + lifecycle (preview/publish/visibility/archive) for brands, products, categories, suppliers, clients, locations with permission enforcement.

**Independent Test** (spec): "As each manager role, perform the full lifecycle (create → preview → publish → edit → deactivate → archive) on each entity type and verify the public effect and permission boundaries."

### Tests for User Story 7 (write FIRST, verify they FAIL)

- [ ] T073 [P] [US7] Integration test `tests/integration/admin-entities.test.ts`: full lifecycle per entity create→preview→publish→edit→deactivate→archive with public-effect assertions; per-module permission refusals across all four roles (SC-004); optimistic lock — concurrent edit with stale `version` → `409 VERSION_CONFLICT` (spec edge case "Concurrent edits"); duplicate slug publication prevented (FR-036); activity-log writes for lifecycle actions
- [ ] T074 [P] [US7] E2E test `tests/e2e/us7-admin-crud.spec.ts`: SC-013 (staff persona creates+publishes a bilingual brand with images first attempt, no assistance — images attached via the US12 media library from Phase 9); archive/visibility public effects; duplicate-slug refusal message shown (FR-036)

### Implementation for User Story 7

- [ ] T075 [US7] Generic admin data-service layer `src/server/services/admin.ts`: `listPaged` (status filter + pagination), `get`, `create`, `updateVersioned` (bilingual fields, version/409), `publish`/`unpublish`, `archive`/`restore`, `setVisibility`, `deleteGuarded` (only when unpublished AND unreferenced); every operation applies `requirePermission` + writes ActivityLog (data-model §3 conventions)
- [ ] T076 [P] [US7] Brands admin module `src/app/[locale]/(admin)/admin/brands/` + endpoints per `admin-api.md` §3 (logo/cover via Media, bilingual name/description, country, category, website, social links, history/distribution per FR-008, featured flag, product assignment, preview, publish) — FR-025, permission brands:*
- [ ] T077 [P] [US7] Products admin module `admin/products/` + endpoints: brand required (FK RESTRICT), categories ≥1, images ≤10 (ordered `ProductImage`), bilingual specs, country of origin (`countryOfOrigin` per data-model §2.4), optional SKU/reference/brochure, preview, publish — FR-026, permission products:*
- [ ] T078 [P] [US7] Categories admin module `admin/categories/` + endpoints: typed `kind` (brand|product|supplier), parent depth ≤2, reorder/sortOrder, activate/deactivate, bilingual names, product assignment; fully dynamic after launch — FR-027, permission categories:*
- [ ] T079 [P] [US7] Suppliers admin module `admin/suppliers/` + endpoints: bilingual, country, logo/cover, history, categories, products, contact info, public disclosure control — FR-028/FR-011, permission suppliers:*
- [ ] T080 [P] [US7] Clients admin module `admin/clients/` + endpoints: logo, industry, location, description, website (per data-model §2.6), visibility + `disclosureApproved` control; "confidential client details are never exposed in any public response" (FR-029/FR-012, data-model §2.6), permission clients:*
- [ ] T081 [P] [US7] Locations admin module `admin/locations/` + endpoints: coordinates (nullable — "no default, never invented"), address, location type, coverage description, verified marking, publish; public only when "verified AND published" — FR-030/FR-013
- [ ] T082 [US7] Reusable admin UI components in `src/components/admin/`: DataTable (paginated, status filter), bilingual field form (locale tabs), confirm dialogs for destructive actions, optimistic-version conflict UI with localized message + reload option, media picker provided by US12 (T091) — responsive + accessible (FR-040/041, responsive-design/ui-ux-pro-max skills)

**Checkpoint**: US7 — staff maintain the entire catalog/directory corpus with permissioned lifecycle.

---

## Phase 11: User Story 8 - Explore suppliers, clients, and geographic presence (Priority: P2)

**Goal**: Public suppliers directory, approved clients page, and geographic-presence experience rendering verified locations only.

**Independent Test** (spec): "Open suppliers, clients, and geographic-presence pages and verify only approved, verified records appear, with detail pages rendering for suppliers."

### Tests for User Story 8 (write FIRST, verify they FAIL)

- [ ] T083 [P] [US8] Integration test `tests/integration/public-directories.test.ts`: suppliers appear only when disclosed AND published (FR-011); confidential clients absent from ALL public output incl. metadata (FR-012); locations render only when `isVerified` AND published (FR-013); with zero verified locations, the page still presents approved coverage wording without fabricated map points (spec US8 scenario 4)
- [ ] T084 [P] [US8] E2E test `tests/e2e/us8-directories.spec.ts`: supplier detail, clients page (approved only), geographic-presence both with a verified location and with none — approved wording "distributed throughout the Kingdom and across borders" present either way; may run against **placeholder** fixtures derived from the approved product concept (flagged non-published — Constitution III; never invented facts); keep the zero-verified-locations empty-state assertion

### Implementation for User Story 8

- [ ] T085 [P] [US8] Suppliers public routes `src/app/[locale]/(site)/suppliers/page.tsx` + `.../suppliers/[slug]/page.tsx`: name (bilingual), country, logo, cover, description, history, categories, products, website, contact info — disclosure-approved only (FR-011)
- [ ] T086 [P] [US8] Clients public route `src/app/[locale]/(site)/clients/page.tsx`: approved client logos/categories/descriptions, disclosureApproved-only (FR-012), confidential data excluded at query layer (data-model §2.6 rule — "never by UI filtering")
- [ ] T087 [P] [US8] Geographic presence `src/app/[locale]/(site)/geographic-presence/page.tsx`: confirmed Jeddah address from Settings, verified-locations list, `src/components/geography/map-section.tsx` provider-neutral adapter (default Leaflet + OpenStreetMap; provider is client-confirmed Open Item 7 — adapter isolates it); text fallback whenever coordinates are absent (FR-013 edge cases)

**Checkpoint**: US8 — credibility pages live, strictly governed by disclosure/verification flags.

---

## Phase 12: User Story 9 - Find anything through global search (Priority: P3)

**Goal**: Postgres-native search across products/brands/suppliers/categories with typed labels, both languages, empty state.

**Independent Test** (spec): "Run representative queries for a product, a brand, a supplier, and a category in both languages and confirm typed, labeled results — plus a clear empty state."

### Tests for User Story 9 (write FIRST, verify they FAIL)

- [ ] T094 [P] [US9] Unit test `tests/unit/search.test.ts`: query builder — `tsvector('simple')` + `pg_trgm`, type filter, pagination, locale-aware title/slug selection, min-length 2 guard (begin as failing, then pass against the built service)
- [ ] T095 [P] [US9] Integration test `tests/integration/search-api.test.ts`: `GET /api/search` returns multi-type labeled results, published-only (confidential clients excluded — edge case "Confidential data"), Arabic and English queries each find the active language record, zero-match → localized empty-state payload, rate limit 429 after 30/min
- [ ] T096 [P] [US9] E2E test `tests/e2e/us9-search.spec.ts`: SC-006 — perceived sub-second results, visible entity-type labels, localized empty state with next steps, result opens detail page in the active language

### Implementation for User Story 9

- [ ] T097 [US9] Migration task: add `search_document` generated columns + GIN index `to_tsvector('simple', …)` on Brand/Product/Supplier/Category, and `pg_trgm` GIN indexes on slug/name fields per `data-model.md` §5 (publication-consistent filtering applied at query layer)
- [ ] T098 [US9] Implement `src/server/services/search.ts`: one round-trip query across product/brand/supplier/category with entity-type labels, localized title/slug/summary for active locale, paginated, published-only predicate
- [ ] T099 [US9] Route handler `src/app/api/search/route.ts` per `public-api.md`: `q` min 2 chars, optional `type`, rate limit 30/min, error envelope, localized messages
- [ ] T100 [US9] Search UI `src/components/site/search-overlay.tsx` integrated in Navbar: debounced input, results with type-label chips, localized empty state, keyboard accessible (FR-040), preserved among the responsive RTL layout

**Checkpoint**: US9 — search finds and labels everything, empty state is friendly, both languages work.

---

## Phase 13: User Story 10 - Manage SEO metadata for public pages and entities (Priority: P3)

**Goal**: Per-locale SEO management (title/description/slug/OG/canonical) with safe slug changes and localized defaults.

**Independent Test** (spec): "Set distinct Arabic and English metadata on a CMS page and a brand, publish, and verify each public page presents its own metadata and canonical address."

### Tests for User Story 10 (write FIRST, verify they FAIL)

- [ ] T101 [P] [US10] Integration test `tests/integration/seo.test.ts`: per-locale metadata pair (title/description/canonical) presented to crawlers for each language; localized-default fallback "derived from its approved content rather than an empty or broken result" (US10.2); slug change → `SlugRedirect` 301 → canonical content, chain-guard (no redirect chains, data-model §2.11); duplicate slug publication refused `409 SLUG_CONFLICT` (FR-036)
- [ ] T102 [P] [US10] E2E test `tests/e2e/us10-seo.spec.ts`: SC-011 across representative pages + entities in both languages; `hreflang`, canonical, and OG tags present per locale

### Implementation for User Story 10

- [ ] T103 [US10] Finalize public SEO output: per-route `generateMetadata` across all public routes composing `SeoMeta` + localized defaults (activates the US1 base), `src/app/[locale]/sitemap.ts` (published pages + entities, both locales), `robots.txt` — FR-034/FR-043
- [ ] T104 [US10] Admin SEO module `src/app/[locale]/(admin)/admin/seo/` + endpoints per `admin-api.md` §7: meta title/description/slug/OG image/canonical per (target, locale), length caps "60/160 guidance" (`data-model.md` §2.10), noindex, redirects list/create/delete — permission seo:*
- [ ] T105 [US10] Slug management: entity services persist `SlugRedirect(oldSlug→newSlug)` on change (301, US10.3), duplicate prevention via partial unique indexes surfaced as `409 SLUG_CONFLICT` (FR-036)

**Checkpoint**: US10 — every public URL carries correct per-locale metadata and slug redirects behave.

---

## Phase 14: User Story 11 - Review platform activity from the dashboard (Priority: P3)

**Goal**: Overview dashboard with counts/entry points + append-only activity log of sensitive administrative actions.

**Independent Test** (spec): "Perform representative admin actions across modules and confirm the overview reflects counts/recent activity and each action appears in the log with actor, time, and action type."

### Tests for User Story 11 (write FIRST, verify they FAIL)

- [ ] T106 [P] [US11] Integration test `tests/integration/activity-log.test.ts`: SC-012 — execute login, create, update, delete/archive, publish/unpublish, visibility change, permission change, user change, sensitive attachment access → ALL present with actor/action/target/timestamp; log is append-only (no update/delete paths exposed — data-model §2.15)
- [ ] T107 [P] [US11] E2E test `tests/e2e/us11-dashboard.spec.ts`: dashboard overview shows counts/entry points + recent activity; a user without log permission is denied (US11 scenario 3)

### Implementation for User Story 11

- [ ] T108 [US11] Replace admin landing placeholder (T051) with `src/app/[locale]/(admin)/admin/page.tsx` + `GET /api/admin/dashboard/overview`: counts + entry points for brands/products/suppliers/clients/categories/locations/inquiries/partnerships/content/media + recent activity (FR-023), localized, responsive (FR-041)
- [ ] T109 [US11] Activity log UI `src/app/[locale]/(admin)/admin/activity/` + `GET /api/admin/activity` (filters actor/action/entityType/date range, pagination) permission activity:read, read-only (no write/delete controls exist) per `admin-api.md` §10

**Checkpoint**: US11 — admins can supervise usage and verify every sensitive action is on the record.

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories; pre-launch quality gates.

- [ ] T110 [P] Security hardening (`plan.md` Security Strategy): security headers via `next.config` (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` for admin routes); secret hygiene audit (no secrets in repo/env files); `pnpm audit` in CI; verify CSRF via Auth.js defaults + Origin checks on all mutations
- [ ] T111 [P] Performance (`plan.md` Performance Strategy): `next/image` responsive variants + prioritized hero, lazy loading below fold, pagination on all long lists, bundle discipline per vercel-react-best-practices (no barrel imports, dynamic imports for admin/search overlay), Lighthouse ≥90 public pages + CLS <0.1 (SC-009, FR-042)
- [ ] T112 [P] Accessibility final sweep (FR-040, SC-007): axe over ALL public routes + admin modules; keyboard walkthrough; 4.5:1 contrast verified on the approved palette incl. gold/lime-on-dark-green accents; `prefers-reduced-motion` honored by Framer Motion config; touch targets ≥44×44; per-component Design QA against the `docs/DESIGN_SYSTEM.md` §44 acceptance-criteria checklist (Constitution XIII)
- [ ] T113 [P] Responsive/RTL final QA (FR-041, SC-008): all primary journeys (company, catalog, inquiry, partnership) + every admin task across 4 viewports, zero horizontal scrolling, both locales; dedicated RTL pass per admin module (risk-mitigation); mixed-script re-verification
- [ ] T114 [P] Content & data governance audit (SC-010, FR-037): every published string traces to CMS/seed/settings or approved profile content — zero placeholders; "50 years of success" remains non-renderable until approved; no invented coordinates/facts; approved assets hash-checked
- [ ] T115 [P] Backup infrastructure (FR-046): production Compose backup job — nightly `pg_dump -Fc` to off-host/media bucket, 30-day retention, weekly dump-integrity check; media bucket versioning enabled (plan Backup/Recovery)
- [ ] T116 [P] Restore drill (SC-015, pre-launch GATE): execute the documented drill from `quickstart.md` §6 (restore into clean instance → boot → spot-check published content, media references, login, lead, redirect) and record evidence under `docs/ops/restore-drills/`
- [ ] T117 [P] Production deployment (plan Deployment): multi-stage Dockerfile → standalone Next.js build; `docker/compose.prod.yml` (app + Caddy auto-HTTPS + PostgreSQL volume + S3 media); env-file secrets; hosting remains portable (Open Item 7)
- [ ] T118 [P] CI workflow `.github/workflows/ci.yml`: install (locked) → lint → typecheck → unit → integration (fresh-migration DB) → production build → E2E + axe → approved-asset SHA-256 verification → `pnpm audit`
- [ ] T119 [P] Documentation: README runbook referencing `specs/001-zain-b2b-platform/quickstart.md`; document env vars, deploy, restore drill, open items; update `AGENTS.md`
- [ ] T120 Final validation: run the full `quickstart.md` §4 gate suite end-to-end; execute the pre-production checklist against the constitution; confirm zero MVP-Out-of-Scope surfaces (no checkout/notifications/analytics/page-builder/CRM/ERP) via the task-review gate (FR-045, SC-014)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — starts immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–14)**: all depend on Foundational; then run in priority order P1 → P2 → P3 (or in parallel per capacity)
- **Polish (Phase 15)**: depends on all target stories complete

### User Story Dependencies

| Story | Phase | Priority | Depends on | Notes |
|---|---|---|---|---|
| US1 bilingual site | 3 | P1 | T013–T026 (foundation incl. seed + assets) | No story deps |
| US2 brands/catalog | 4 | P1 | T013–T026; none | Needs published records (US7 seeds them) — read side tested with seed/JSON fixtures |
| US3 sign-in/RBAC | 5 | P1 | T016–T019 (foundation) | No story deps |
| US4 inquiry | 6 | P1 | US2 CTAs (mount), foundation | `inquiries:*` nav appears after US3 shell; US1 contact route host |
| US5 partnership | 7 | P2 | US4 (shared lead helpers + status pipeline), media validation (T025) | |
| US6 structured CMS | 8 | P2 | US1 services + US3 shell | Includes Settings editor + `settings:*` (FR-014) |
| US12 users/media | 9 | P2 | US3 auth, T024–T026 media foundation | Ships BEFORE US7 — feeds US7 forms (media upload + MediaPicker) |
| US7 entity CRUD | 10 | P2 | US3 permission enforcement, **US12 media upload + MediaPicker + users**, US11-independent | Supplies the published records US2/US8 read; attaches media via US12 |
| US8 public directories | 11 | P2 | US7 (managed records) or fixture data | Published-only reads; confidentiality flags enforced at query layer |
| US9 search | 12 | P3 | US7 records + T097 migration | Independent of US10 |
| US10 SEO | 13 | P3 | US1 base metadata, US7 (entities to attach SEO) | |
| US11 dashboard/activity | 14 | P3 | US3, US7, US12 (actions to log) | Last phase; consumes all logs |

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Schemas/services before endpoints; services before public/admin integration
- Story complete only when Independent Test + its tests pass

## Parallel Opportunities

- All Setup tasks marked [P] run in parallel
- Foundational groups run in parallel: data layer (T013–T015) ‖ auth/RBAC (T016–T019) ‖ i18n/design (T020–T023) ‖ media (T024–T025) ‖ assets (T026) — T011/T012 (setup) must precede HTTP consumers
- After Foundational, stories are parallelizable:
  - Developer A: US1 public site — Developer B: US3 auth/RBAC — Developer C: US2 catalog read
  - Later: US6 CMS ‖ US12 users/media ‖ US7 entity CRUD (US12 media ships before US7 forms; each touches distinct admin modules)
  - Later: US9 search ‖ US10 SEO ‖ US11 dashboard
- Within each story: test tasks marked [P]; component/service tasks marked [P] share files only where noted
- Polish tasks are independently parallel per file/module

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together:
Task: "Unit i18n parity + fallback in tests/unit/i18n.test.ts"
Task: "Integration public content read tests in tests/integration/public-content.test.ts"
Task: "E2E SC-001/007/008/009 in tests/e2e/us1-public-site.spec.ts"

# Then implementation in dependency order:
Task: "cms.ts + settings.ts services (T030/T031)"
Task: "content.ts service (T032)"
Task: "public shell + home route (T033/T034)"
Task: "about group + contact info + SEO base (T035/T036/T037)"
```

## Implementation Strategy

### MVP First (User Story 1 + core P1)

1. Phase 1: Setup
2. Phase 2: Foundational (critical — blocks everything)
3. Phase 3–6: US1 → US2 → US3 → US4 (the four P1 stories)
4. **STOP and VALIDATE**: each story independently green including E2E gates
5. Deploy/demo the P1 slice before P2/P3 work

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test independently → demo (public bilingual site)
3. US2 → test → demo (catalog)
4. US3 → test → demo (secure admin)
5. US4 → test → demo (leads) — MVP complete
6. US5, US6, US12, US7, US8 → independent increments (US12 media before US7 forms)
7. US9, US10, US11 → independent increments
8. Polish phase → launch gates (security, perf, a11y, governance audit, backups, restore drill SC-015)

### Parallel Team Strategy

- Team builds Setup + Foundational together
- Then: Developer A = US1; Developer B = US3; Developer C = US2
- Then: A = US6, B = US12, C = US7 (US12 media first so US7 forms attach images); US4/US5 serialize after US2/US3 because of integration points
- US8, US9, US10, US11 attach as record/data becomes available

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps tasks to spec user stories for traceability
- Commit after each task or logical group; commit messages reference task IDs
- Verify tests fail before implementing (TDD per story)
- Never introduce MVP-excluded functionality or unapproved facts (Constitution II & III); client-pending decisions stay isolated behind CMS/Settings/adapters (Open Items)
- Rely on the loaded skills at implementation time: frontend-design, ui-ux-pro-max, responsive-design, web-design-guidelines (UI), vercel-react-best-practices, typescript-advanced-types (code), browser-automation (rendered-page verification)