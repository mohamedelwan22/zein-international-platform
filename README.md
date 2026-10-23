# Zain International Trading — B2B platform

Bilingual (Arabic/English, full RTL) marketing and B2B platform for Zain
International Trading: public company site, brand/product catalog, directories,
inquiry and partnership lead capture, search, and a CMS-backed admin.

## Stack

- Next.js 16.4.2 (App Router, Cache Components, standalone output) + React 19
- TypeScript, Tailwind CSS 4
- Prisma 7 with the `pg` driver adapter, PostgreSQL 17
- Auth.js v5 (beta) with role-based access (SuperAdmin/Admin/Editor/Viewer)
- `next-intl` for locale routing (`/en`, `/ar`) and RTL
- S3-compatible object storage (S3Mock in development), media proxied by the app
- Vitest (unit/integration) and Playwright + axe (E2E/a11y/RTL)

## Prerequisites

- Node.js 24 and pnpm 11.2.2 (`corepack enable`)
- Docker with Compose v2 (PostgreSQL on `:5434`, S3Mock on `:9100`)

## Local development

```bash
pnpm db:up                     # start PostgreSQL + S3Mock
cp .env.example .env           # then fill in local values
pnpm db:migrate                # apply the schema (additive)
pnpm db:seed                   # load approved seed content
pnpm dev                       # http://localhost:3000
```

The database must be running before `pnpm dev`: public pages read content on
the server. `DATABASE_URL` points at
`postgresql://zein:zein@localhost:5434/zein` by default.

> **Prisma error with `findUnique`/`findMany` and `code: "ECONNREFUSED"`:** with
> Prisma 7 + the `pg` adapter an unreachable database surfaces as a
> `PrismaClientKnownRequestError`, not `P1001`. Check
> `docker compose ps` before inspecting the schema.

## Environment variables

Names and safe local defaults are documented in `.env.example`; never commit
real secrets (`.env*` is git-ignored). Key variables: `DATABASE_URL`,
`AUTH_SECRET`, `AUTH_TRUST_HOST`, `NEXT_PUBLIC_SITE_URL`, `S3_*`,
`MAP_PROVIDER`/`MAP_TOKEN`, `LOG_LEVEL`. Production adds `POSTGRES_*`,
`CADDY_DOMAIN`/`CADDY_EMAIL`, and backup variables — see
[`docs/ops/production-deployment.md`](./docs/ops/production-deployment.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / production build / server |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test:unit` / `pnpm test:integration` | Vitest suites |
| `pnpm test:e2e` / `pnpm test:e2e:rtl` | Playwright suites / RTL + Arabic a11y |
| `pnpm verify:assets` | SHA-256 check of the approved `public/` manifest |
| `pnpm verify:deps` | Fail-closed dependency-audit gate |
| `pnpm audit:content` | Content-governance scan (placeholders/unapproved claims) |
| `pnpm db:generate` / `db:migrate` / `db:migrate:prod` / `db:seed` | Prisma |
| `pnpm db:backup` / `db:backup:verify` / `db:restore:drill` | Backup + restore drill |
| `pnpm storage:setup` | Create media bucket + enable versioning |

## Content and data governance

Published content is CMS/seed/settings backed only — no invented facts,
coordinates, or placeholder copy. The "50 years of success" statistic is
**not renderable** until a permission-gated approval writes the server-side
approval register (payload `approved: true` alone is insufficient). Only the
approved logo/hero assets exist under `public/`. See
[`docs/ops/content-governance/`](./docs/ops/content-governance/) and
[`specs/001-zain-b2b-platform/`](./specs/001-zain-b2b-platform/).

## Operations

- [Production deployment](./docs/ops/production-deployment.md) — Compose stack, build secret, migrations, rollback
- [Backup and restore](./docs/ops/backup-and-restore.md) — dumps, off-host copy, restore drill
- [Security headers](./docs/ops/security-headers.md) — CSP/HSTS policy and verification
- [Dependency audit](./docs/ops/dependency-audit.md) — fail-closed gate and the single temporary exception
- [Restore-drill evidence](./docs/ops/restore-drills/)
- Development/verification walkthrough and gate suite: [`specs/001-zain-b2b-platform/quickstart.md`](./specs/001-zain-b2b-platform/quickstart.md)

## Status

Functional and test-covered, but **not yet cleared for production**: a staging
deploy and off-host backups are still required, and client Open Items
(domain, map provider, notification provider, analytics/consent, final content,
backup destination, roles) remain open. See the task list in
`specs/001-zain-b2b-platform/tasks.md`.
