# Quickstart & Validation Guide

**Feature**: 001-zain-b2b-platform | **Date**: 2026-10-07 | **Inputs**: `plan.md`, `data-model.md`, `contracts/`, `spec.md` SC-001–SC-015.

Runbook to get the app running locally, exercise every gate, and prove the SC-015 restore drill. No source code exists yet — these commands are the contract for what `/speckit.tasks` must enable (scripts named here are tasks, not yet present).

## 1. Prerequisites

- Node.js 24 LTS, pnpm (corepack), Docker + Compose.
- PostgreSQL 17+ (provided by `docker compose` in dev; managed DB in production).

## 2. Environment variables

`.env` (dev) / env-file per environment (prod). Required:

| Variable | Dev default | Prod (required) |
|---|---|---|
| `DATABASE_URL` | `postgresql://zein:zein@localhost:5432/zein` | managed endpoint |
| `S3_ENDPOINT` | `http://localhost:9000` (MinIO) | S3-compatible endpoint |
| `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` | `zein-media` / `minioadmin` / `minioadmin` / `us-east-1` | per provider |
| `AUTH_SECRET` | generate once, keep stable | strong random; rotate rarely via documented procedure |
| `AUTH_TRUST_HOST` | `true` (behind Compose proxy) | `true` behind Caddy |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `https://…` (client-confirmed domain ⚠) |
| `MAP_PROVIDER` / `MAP_TOKEN` | `osm` (no token) | client-confirmed provider ⚠ (Open Item 7) |
| `LOG_LEVEL` | `debug` | `info` |

Never commit `.env`; names/policies enforced in CI lint. Add `S3_*` and `AUTH_SECRET` to CI secrets only as mock/derived values matching ephemeral containers (integration suite uses its own throwaway DB URL).

## 3. Start infrastructure + dev server

```text
pnpm install               # frozen lockfile
docker compose up -d      # postgres + minio (dev profile)
pnpm db:migrate dev       # apply committed migrations
pnpm db:seed              # idempotent seed — approved profile content only
pnpm dev                  # http://localhost:3000 (en/ar)
```

- MinIO: create bucket `zein-media` (Compose `create_buckets` job handles it) and enable versioning for `zein-media` (backup parity, FR-046).
- **Asset integrity** (Constitution XIII): copy `docs/logo.png` and `docs/hero.png` byte-identical into `public/`, then verify equality:
  `Get-FileHash docs/logo.png, public/logo.png -Algorithm SHA256` → identical hashes (same for `hero.png`). Never regenerate/filter/recolor these files (US12.3).

## 4. Validate the app (per-project gates)

```text
pnpm typecheck            # tsc --noEmit (strict)
pnpm lint                 # ESLint (CI gate)
pnpm test:unit            # Vitest — schemas, permission matrix (SC-004 exhaustive), slug/search helpers, i18n fallback
pnpm test:integration     # Vitest against ephemeral PostgreSQL (fresh migrations each run) —
                          # CRUD+publish lifecycle, permission refusal (SC-004), lead consent+rate-limit,
                          # slug redirects, optimistic-lock 409, activity-log asserts (SC-012), seed provenance (SC-010)
pnpm build                # production build (Cache Components)
pnpm test:e2e             # Playwright — journeys mapped to SC-001..SC-008 + admin RBAC matrix;
                          # runs in BOTH locales, 4 viewports (mobile/tablet/laptop/desktop), axe-core scans
pnpm test:e2e:rtl         # dedicated RTL pass per admin module (Risk 2)
```

CI runs all of the above on every push; migrations are applied to a fresh DB inside CI to catch drift (Migration Strategy).

## 5. Manual quick-audit

- Public home → brand → product → inquiry (`SC-002`): feature content, no price/stock/cart affordances anywhere (Constitution VII).
- Submit contact + partnership with consent; confirm `consent=false` → localized 400 (FR-017/018, Clarification 2).
- Log in as each of the 4 roles; attempt a forbidden action → 403 (SC-004).
- Edit a CMS section (draft) → public page unchanged; publish → reflect after invalidation (SC-005).
- Search Arabic + English, including partial/prefix terms and empty state (SC-006).
- Toggle reduced-motion; keyboard-walk the public site (FR-040).
- Lighthouse run on public pages: performance ≥ 90, CLS < 0.1, no layout shift from fonts (SC-009, FR-042).

## 6. Restore drill — proves FR-046/SC-015 (pre-launch GATE)

Scheduled in production by cron/Compose job → `pg_dump -Fc` nightly to the media bucket (30-day retention) + weekly dump-integrity check; media bucket versioning enabled (FR-046, Clarification 4). The drill (repeatable, evidence recorded):

```text
1. Stop the app container (compose down), simulating an outage.
2. Restore into a CLEAN instance:  pg_restore --clean --if-exists --dbname zein < latest.dump
3. Boot the app against the restored DB and the production media bucket.
4. Verify: login works; spot-check 3 published pages/brands/products per locale (SC-011 metadata intact);
   an uploaded media file renders from bucket; a lead submitted pre-backup is present; slug redirects 301 (US10.3).
5. Record results (date, dump id, checksums, findings) as SC-015 evidence in the repo (e.g. docs/ops/restore-drills/).
6. If any spot-check fails: do not relaunch; document and fix, then re-run the drill fully.
```

Drill frequency: at least once before launch and annually / after every major schema change. A backup is also taken immediately before any production migration apply (Migration Strategy).

## 7. Production deploy (one-command parity)

```text
docker compose -f docker/compose.prod.yml up -d --build   # app + Caddy (auto-HTTPS) + postgres volume + media bucket
```

Secrets via env-file; zero-downtime restart policy; `/api/health` in Caddy health checks. The host stays portable to any VPS/cloud the client confirms (⚠ Open Item 7).

## 8. When something is missing

If any command above has no corresponding script yet, it means that task has not been scheduled — this guide is the *product backlog demand* from `/speckit.plan`; `/speckit.tasks` must produce tasks that make every line runnable, and the pre-production gate (constitution) closes the loop.