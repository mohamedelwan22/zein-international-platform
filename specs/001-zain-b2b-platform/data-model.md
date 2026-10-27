# Phase 1 — Data Model

**Feature**: 001-zain-b2b-platform | **Date**: 2026-10-07 | **Inputs**: `spec.md` (Key Entities, FRs, Clarifications), `plan.md` (Domain/Database Approach), constitution Principle VIII ("exact cardinalities MUST be validated during architecture planning").

Design-level document: entity fields, cardinalities, validation, and state machines. Physical DDL is produced later as `prisma/schema.prisma` + migrations (not by `/speckit.plan`).

---

## 0. Constitution VIII cardinality validation

| # | Relationship | Cardinality | Validated | Notes |
|---|---|---|---|---|
| 1 | Brand → Product | 1 → * (required FK on Product) | ✅ | Every product belongs to exactly one brand (spec: brands hold products) |
| 2 | Product → Supplier | * → 1 (optional FK) | ✅ | Supplier may be unknown/unconfirmed for some products |
| 3 | Product ↔ Category | * ↔ * (join `ProductCategory`) | ✅ | ≥1 category required by validation rule (spec: categorized catalog) |
| 4 | Brand ↔ Category | * ↔ * (join `BrandCategory`) | ✅ | ≥1 category required |
| 5 | Supplier ↔ Category | * ↔ * (join `SupplierCategory`) | ✅ | ≥1 category required |
| 6 | Inquiry → Product/Brand/Supplier | * → 0..1 each (optional FKs, `SET NULL`) | ✅ | Lead may originate from a general page |
| 7 | PartnershipRequest → Product/Brand/Supplier | * → 0..1 each (optional, `SET NULL`) | ✅ | Same as above |
| 8 | PartnershipRequest → Media (attachment) | * → 0..1 (optional FK) | ✅ | PDF attachment if provided |
| 9 | Media → entity usage | resolved by FK references from Brand/Product/CmsSection(OG)/SeoMeta/PartnershipRequest — no usage table | ✅ | Plan: "usage resolved by querying references (no sync-prone usage table)" |
| 10 | User → ActivityLog | 1 → * (append-only) | ✅ | Actor on every log row |
| 11 | Location → Media (optional image) | * → 0..1 | ✅ | Verified coordinates gate public rendering |
| 12 | Category → Category (parent) | self-referencing 0..1 parent, * children | ✅ | One-level tree allowed; depth capped at 2 by validation |
| 13 | CmsSection | (section_key, locale) unique — 1 → 1 per pair | ✅ | Fixed registry × 2 locales |
| 14 | SeoMeta → target entity | polymorphic (* → 1 target) with CHECK-constrained `targetType` | ✅ | One SEO row per (targetType, targetId, locale) |

No circular dependencies exist between aggregates. All cardinalities above are enforced with FK constraints + `NOT NULL`/`NULL` choices and checked by integration tests.

---

## 1. Entity overview

```text
User (role enum) ──< ActivityLog
Category ──< Brand >──< BrandCategory >── Category
             └──< Product >──< ProductCategory >── Category
                    ├── Supplier (optional)
                    └── Media (images, FK refs)
Supplier ──< SupplierCategory >── Category
Client (disclosureApproved flag)
Location (isVerified flag, optional Media)
CmsSection (draft/published JSONB per section_key × locale)
SeoMeta (per target × locale)   SlugRedirect (old → new)
Inquiry (status machine, consent, optional links → Product|Brand|Supplier)
PartnershipRequest (same + optional Media attachment)
Settings (key/value, localized)
Media (S3 key, alt_en/alt_ar, archive state)
RateLimitCounter, AuthAttempt (operational)
```

## 2. Entities

### 2.1 User (admin staff — no public accounts exist, US12, Out of Scope)

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| email | citext/text | UNIQUE, required, format-validated |
| name | text | required |
| passwordHash | text | argon2id; never selected in API responses |
| role | enum `SuperAdmin \| ContentManager \| ProductManager \| SalesBusiness` | required (FR-021, exactly 4 roles) |
| active | boolean | default true; deactivation = next-request lockout (US12.4) |
| tokenVersion | int | default 1; bumped on password change/deactivation → JWT revocation |
| failedLogins / lockedUntil | int / timestamptz | login throttling (US3.4) |
| lastLoginAt | timestamptz? | informational, activity-adjacent |
| version | int | optimistic concurrency (all editable entities) |
| createdBy / updatedBy | uuid FK → User | required |
| createdAt / updatedAt | timestamptz | required |

Validation: email unique case-insensitively; role change and any user create/update/deactivate are `ActivityLog` events (FR-035); self-deactivation prevented (last Super Admin guard).

### 2.2 Category

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| kind | enum `brand \| product \| supplier` | required — categories are typed (plan) |
| parentId | uuid? FK → Category | optional, depth ≤ 2 |
| name_en / name_ar | text | both required (bilingual foundation) |
| slug_en / slug_ar | text | unique per (kind, locale) via partial unique indexes (FR-036) |
| description_en / description_ar | text? | optional |
| status | enum `draft \| published \| archived` | lifecycle |
| isActive | boolean | publication predicate = `status='published' AND isActive` |
| sortOrder | int | ordering |
| search_document | generated tsvector | §5 |
| version, timestamps, createdBy/updatedBy | | as global convention |

### 2.3 Brand

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| name_en / name_ar | text | required (Latin brand names may repeat inside Arabic content — mixed-script rule) |
| slug_en / slug_ar | text | unique per locale |
| summary_en / summary_ar | text? | search source |
| originCountry_en / originCountry_ar? | text | client-supplied facts only |
| history_en / history_ar?, distributionInfo_en / distributionInfo_ar? | text? | FR-008 brand-detail content (history, distribution information) |
| logoMediaId | uuid? FK → Media | nullable |
| status / isActive / sortOrder / version / audit cols | | convention |
| search_document | generated tsvector | §5 |

Junctions: `BrandCategory(brandId, categoryId)` — PK (brandId, categoryId), both FKs, ≥1 row required by service validation; `Product.brandId` FK → Brand `ON DELETE RESTRICT` (1 → *).

### 2.4 Product

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| brandId | uuid FK → Brand | **required** (cardinality #1, RESTRICT) |
| supplierId | uuid? FK → Supplier | optional, `SET NULL` (cardinality #2) |
| name_en / name_ar | text | required |
| slug_en / slug_ar | text | unique per locale |
| summary_en / summary_ar | text? | search source |
| description_en / description_ar | rich text? | structured content only (no raw HTML path) |
| sku / model | text? | informational; **no price/stock fields exist** (Constitution VII) |
| countryOfOrigin_en / countryOfOrigin_ar? | text | client-supplied facts only; drives the FR-009 country filter |
| images | ordered refs: `ProductImage(productId, mediaId, sortOrder)` join | max 10 by validation |
| status / isActive / sortOrder / version / audit cols | | convention |
| search_document | generated tsvector | §5 |

Junctions: `ProductCategory` (≥1 row required), junction to categories (#3). Publication predicate joins categories/brands as published too (no orphan public detail pages).

### 2.5 Supplier

Fields: name/slug/summary per locale, `originCountry_en/originCountry_ar?`, optional `coverMediaId?` FK → Media, `history_en/history_ar?`, category junctions (≥1), optional contact fields (website/phone — client-supplied), `status/isActive/version/audit`, `search_document`. Products link optionally (`SET NULL`). Supplier detail renders per FR-011 (name, country, logo, cover, description, history, categories, products, website, contact); public rows are disclosed AND published only.

### 2.6 Client (Confidential)

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| name_en / name_ar | text | required |
| logoMediaId | uuid? FK → Media | |
| industry_en / industry_ar? | text | |
| location_en / location_ar? | text | FR-012 / US12.2 |
| website? | text | FR-012 / US12.2 |
| disclosureApproved | boolean | **default false — confidential** |
| status / isActive / sortOrder / version / audit cols | | convention |

**Confidentiality rule**: public queries require `disclosureApproved = true` *and* publication predicate — enforced in the service/query layer, never by UI filtering (spec edge case; Risk 9 in checklist terms).

### 2.7 Location

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| city_en / city_ar, address_en / address_ar | text | required |
| countryCode / region | text? | informational |
| latitude / longitude | decimal? | **nullable — no default, never invented** (FR-013/Assumptions) |
| isVerified | boolean | default false |
| phone / email | text? | |
| mapUrl? | text? | provider-supplied link if available |
| mapEmbedUrl? | text? | optional Google Maps embed URL; staff may paste a URL or iframe snippet, but only the validated `src` URL is stored and re-validated before rendering |
| imageMediaId | uuid? FK | |
| status / isActive / sortOrder / version / audit cols | | convention |

**Render rule**: public map pins require `isVerified = true AND latitude/longitude IS NOT NULL AND status='published'`; otherwise text-address rendering. An eligible public location with a valid `mapEmbedUrl` also renders a responsive Google Maps iframe; without one it falls back to the text address and an address-search link. Map provider ⚠ (Open Item 7).

### 2.8 CmsSection

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| section_key | enum `home \| about \| contact` | fixed registry (Constitution IV) |
| locale | enum `en \| ar` | |
| draft_content | jsonb | Zod-typed schema per section_key (field whitelist) |
| published_content | jsonb? | null = never published |
| publishedAt | timestamptz? | |
| approvedFlags | jsonb? | statistics/approved-claims map (FR-007: unapproved stats not rendered) |
| version / updatedBy / timestamps | | (createdBy on first write) |

UNIQUE (section_key, locale). Publish = copy draft → published + cache tag invalidation. JSON payloads validated against per-section typed schemas on write — no arbitrary markup (FR-032).

### 2.9 Media

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| kind | enum `image \| document` | |
| mimeType | text | allowlist-validated + magic-byte sniffed at upload (FR-033) |
| byteSize | int | ≤ image 10 MB / doc 20 MB (plan defaults) |
| storageKey | text | randomized; UNIQUE |
| originalName | text | display only; never used as storage path |
| alt_en / alt_ar | text? | required for informative images when used publicly |
| sha256 | text | integrity/verification |
| archivedAt / deletedAt? | timestamptz? | soft-archive (active usage check before purge) |
| uploadedBy | uuid FK → User | |
| createdAt | timestamptz | |

References (FKs from Brand.logoMediaId, ProductImage, Location.imageMediaId, PartnershipRequest.attachmentMediaId, SeoMeta.ogImageMediaId, CmsSection content refs) determine usage. Attachment access by Sales/Business is an `ActivityLog` event (FR-035).

### 2.10 SeoMeta

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| targetType | enum `page \| brand \| product \| supplier \| category \| client \| location` | CHECK-constrained |
| targetId | uuid? | null for built-in pages (identified by `pageKey` instead) |
| pageKey | text? | e.g. `home`, `about` — exactly one of targetId/pageKey set |
| locale | enum | |
| metaTitle / metaDescription | text? | length-validated (60/160 guidance, hard caps) |
| slugOverride? | text? | rare; normally slugs live on the entity |
| ogImageMediaId | uuid? FK | approved og image default |
| canonicalUrl? | text? | |
| noindex | boolean | default false |
| version / audit cols | | convention |

UNIQUE (targetType, targetId, locale) where targetId not null; UNIQUE (pageKey, locale) where pageKey not null.

### 2.11 SlugRedirect

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| entityType | enum | same members as SeoMeta.targetType |
| locale | enum | |
| oldSlug | text | UNIQUE with (entityType, locale) |
| newSlug | text | |
| createdAt | timestamptz | optional cleanup window considered, default keep forever (cheap rows) |

Written on every slug change (US10.3); served as HTTP 301. Chain guard: if oldSlug already exists as an entity slug → resolve to canonical, no chains.

### 2.12 Inquiry (Contact/Quote request)

| Field | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| type | enum `product \| brand \| supplier \| distribution \| partnership \| general` | required (FR-016) |
| name, company?, email, phone? | text | name/email required; at least one of phone/email required (validity rule) |
| subject | text | required, length-capped (FR-016) |
| message | text | required, length-capped |
| consentAccepted | boolean | **must be true** (Clarification 2) |
| consentAt | timestamptz | server timestamp of acceptance |
| locale | enum | submission locale |
| productId? / brandId? / supplierId? | uuid? FKs | `SET NULL`; captured from source page context |
| sourcePath / referrer? | text | context for sales |
| status | enum `new \| contacted \| inProgress \| closed` | shared lead pipeline (Clarification 3) |
| statusChangedAt, statusChangedBy? | | |
| notes? (internal) | text? | staff-only field, never serialized publicly |
| createdIpHash? | text | rate-limit forensics; hashed, not raw |
| createdAt | timestamptz | |

No outbound notification of any kind is sent (Clarification 1); status changes write `ActivityLog`.

### 2.13 PartnershipRequest

Same core fields as Inquiry (name, company, email, phone, message, consent + consentAt, locale, status machine, timestamps) plus:

| Field | Type | Constraints |
|---|---|---|
| businessType / capacity? | text? | FR-018 "business type" (spec terminology unified; formerly "sector") |
| attachmentMediaId | uuid? FK → Media | document, ≤20 MB, allowlisted; access audited |
| status | same enum | shared pipeline (Clarification 3) |

Note: PartnershipRequest additionally carries the FR-018 country / website / product-category fields within its lead profile (bilingual storage alongside the shared lead fields).

### 2.14 Settings

| Field | Type | Constraints |
|---|---|---|
| key | text | PK part, e.g. `contact_info`, `social_links`, `privacy_notice`, `working_hours` |
| value_en / value_ar | jsonb | localized typed values (per-key Zod schema) |
| updatedBy / updatedAt | | |

Privacy-notice content lives here so consent copy can be injected without code change (Risk 3). Company facts (address/phones/email) seeded from `docs/PROJECT_REQUIREMENTS.md` only.

### 2.15 ActivityLog (append-only)

| Field | Type | Constraints |
|---|---|---|
| id | uuid (or bigserial) | PK |
| actorId | uuid FK → User | required (system actor only if ever needed — not in MVP) |
| action | enum | `login, logout, create, update, delete, archive, publish, unpublish, visibilityChange, permissionChange, userCreate, userUpdate, userDeactivate, attachmentAccess, statusChange, roleChange, settingsUpdate` (superset covering FR-035 list) |
| entityType / entityId | text / uuid | target |
| summary? | text? | human-readable diff summary (no sensitive payloads) |
| createdAt | timestamptz | required |

No update/delete API paths exist (append-only). Read restricted to roles with `activity:read` (Super Admin default; Content Manager per matrix review in tasks).

### 2.16 Operational tables

- **RateLimitCounter**: `bucketKey` (e.g. `inquiry:ip:hash`), `windowStart`, `count` — PK (bucketKey, windowStart); rows pruned after window+grace.
- **AuthAttempt**: `email`, `ipHash`, `success`, `createdAt` — login audit for US3.4 lockout forensics and activity correlation. Written on **every** attempt (success/failure/lockout).

## 3. Global conventions (every editable entity)

`id uuid PK` · `version int NOT NULL DEFAULT 1` · `createdAt/updatedAt timestamptz` · `createdBy/updatedBy uuid FK User` (createdBy required; updatedBy optional on insert) · publication pair (`status`, `isActive`) where publicly visible · `updatedAt` via Prisma `@updatedAt`.

**Publication predicate** (single canonical helper): `status = 'published' AND isActive = true` (+ `disclosureApproved` for Client, `isVerified` for Location map pins).

## 4. State machines

```text
Entity lifecycle (Brand, Product, Supplier, Client, Location, Category):
  draft ──publish──► published ──unpublish──► draft
    │                    │
    └──archive◄──────────┘   archived ──restore──► draft
  (isActive toggles visibility without archive; every transition → ActivityLog)

Lead pipeline (Inquiry, PartnershipRequest) — Clarification 3:
  new ──► contacted ──► inProgress ──► closed
  (any → any forward/back allowed by sales need? → spec lists progression;
   implementation allows new→contacted→inProgress→closed plus closed→contacted reopen,
   each transition logged with actor)

CMS payload:
  draft_content ──publish──► published_content (copy) + tag invalidation
  published_content ──unpublish──► null

Location verification (staff workflow):
  unverified ──staff verifies source──► isVerified (with coordinates) ──revoke──► unverified
```

Every transition is a validated service operation → `requirePermission()` → transaction → `ActivityLog`.

## 5. Search projection

Per searchable entity (Brand, Product, Supplier, Category): generated column
`search_document = to_tsvector('simple', normalize(name_en || ' ' || name_ar || ' ' || summary…))`
with GIN index; `pg_trgm` GIN on `slug_en`, `name_en`, `name_ar` for partial matching.
Only rows satisfying the publication predicate are returned (query-level filter; partial index where practical). `Client` is **excluded** from search until `disclosureApproved`.

## 6. Indexes (minimum set)

- Unique partial: `(slug_en)` / `(slug_ar)` per entity type; `(section_key, locale)`; SEO composites; `SlugRedirect(oldSlug, entityType, locale)`.
- Publication lists: `(status, isActive, sortOrder)` per entity; `(disclosureApproved, status)` on Client; `(status)` on leads.
- FKs all indexed (Prisma default) + `Inquiry(productId/brandId/supplierId)`, `ActivityLog(actorId, createdAt)` for dashboard queries.
- `RateLimitCounter(bucketKey, windowStart)` PK covers limiter reads.

## 7. Validation summary (Zod, shared client/server)

- All localized text: non-empty when required, length caps per field; both locales required for names/slugs of core catalog entities.
- Slug format: lowercase Latin, hyphens, per-locale uniqueness (FR-036); generation from `name_en`/`name_ar` with transliteration for Arabic, collision suffixing.
- Email/phone formats; consent boolean `true` strictly; lead minimum-contact rule; inquiry `type` enum + required `subject` (FR-016); message length caps.
- Uploads: mime allowlist, magic bytes, size caps, `alt` required for public images.
- Optimistic lock: `version` supplied on every update → 409 on mismatch.
- Role enum restricted to the four values; permission matrix validated exhaustively in unit tests (SC-004).

## 8. Seeding & data governance (Constitution III, SC-010)

`prisma/seed.ts` is idempotent and loads **only** approved profile content: categories (initial list from PRD), contact settings (address/phones/email from PRD), values, mission/vision, about copy — each row tagged with a source reference (`sourceDoc`) for SC-010 evidence. Explicitly **not** seeded: coordinates, statistics counters (including "50 years"), brand/supplier/client lists pending Open Items 4–5, any invented facts. E2E catalog/directory journeys may use **placeholder** fixtures derived from the approved product concept, flagged non-published (Constitution III) — never presented as approved company facts.