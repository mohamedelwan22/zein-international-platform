# Production deployment

Runbook for the production Compose stack (`docker/compose.prod.yml`): Next.js
standalone app + Caddy (automatic TLS) + PostgreSQL 17 + external S3-compatible storage.

> **Status:** this stack has **not** been deployed to a real server yet. The
> steps below are the intended procedure; image builds are currently blocked in
> this environment by registry connectivity, and Caddy image tags could
> not be resolved from Docker Hub. Treat every step as unverified until a
> staging deploy is actually performed.

## Prerequisites

- Docker Engine 24+ with BuildKit, Compose v2.24+ (needs `env_file.required`
  and `build.secrets`).
- A DNS `A`/`AAAA` record for `CADDY_DOMAIN` pointing at the host, with ports
  `80`/`443` reachable (Caddy obtains certificates automatically).
- A migrated PostgreSQL database. For the in-stack database, `postgres` is only
  reachable on the Compose network; the **build** stage needs a database it can
  reach (see "Build-time database").
- An S3-compatible bucket for media (external S3 only; no in-stack object storage).

## Files

| File | Purpose | Committed? |
| --- | --- | --- |
| `.env.production` | Runtime/interpolation environment (repo root). | No (`.env*` ignored) |
| `docker/.env.build` | Build-time environment mounted as the `build_env` secret. | No |
| `docker/.env.build.example` | Template for the build-time file. | Yes |
| `docker/Caddyfile` | TLS + reverse proxy to `app:3000`. | Yes |

`docker/compose.prod.yml` resolves `env_file` entries relative to `docker/`, so
`../.env.production` is the repo-root file that is also passed to `--env-file`.

## Environment variables (names only — never commit values)

Runtime (`/.env.production`):

| Variable | Notes |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Consumed by the `postgres` service. |
| `DATABASE_URL` | App/migrate connection; use `postgres:5432` inside Compose (`postgresql://<user>:<pass>@postgres:5432/<db>`). |
| `AUTH_SECRET` | ≥ 32 random characters, stable. Rotating it signs everyone out. |
| `AUTH_TRUST_HOST` | `true` behind Caddy. |
| `NEXT_PUBLIC_SITE_URL` | Public HTTPS origin. **Baked at build time** — set it before building. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | Media storage. Use an external S3-compatible endpoint (path-style is supported by the app). |
| `MAP_PROVIDER`, `MAP_TOKEN` | Open Item 7 (client decision). |
| `LOG_LEVEL` | e.g. `info`. |
| `CADDY_DOMAIN`, `CADDY_EMAIL` | Caddy site address and ACME email. |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX` | Off-host backup destination (required before go-live). |
| `MINIO_IMAGE`, `CADDY_IMAGE`, `APP_IMAGE_TAG`, `APP_MEM_LIMIT`, `APP_CPUS` | Optional overrides. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Only if you intentionally run the seed once. |

Build (`docker/.env.build`, see `docker/.env.build.example`):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | A migrated database reachable **from the build stage**. |
| `AUTH_SECRET` | Any ≥ 32 char placeholder; the runtime value is separate. |
| `S3_*`, `NEXT_PUBLIC_SITE_URL` | Same public values as runtime. |
| `LOG_LEVEL`, `MAP_PROVIDER` | Optional. |

`BUILD_ENV_FILE` is an **absolute** path to `docker/.env.build`; Compose
requires it whenever it evaluates `build` (including `docker compose config`).

## Build-time database

With Cache Components, `next build` executes cached content loaders and needs a
reachable, migrated database. The build container is not on the runtime Compose
network, so choose one:

- Build against a managed/dedicated database reachable from the build host, or
- Temporarily make the stack database reachable (publish `5432` for the build
  window, then remove it), or
- Build on the database host with a `DATABASE_URL` that resolves there.

A complete, deterministic prerender also needs the seeded content rows. Never
put a production admin password in the build file.

## First run

```bash
# 0. Provision environment (never commit these files)
cp .env.example .env.production          # fill in real values
cp docker/.env.build.example docker/.env.build   # fill in build values
export BUILD_ENV_FILE="$PWD/docker/.env.build"

# 1. Validate the rendered configuration
docker compose -f docker/compose.prod.yml --env-file .env.production config --quiet

# 2. Data services first
docker compose -f docker/compose.prod.yml --env-file .env.production up -d postgres

# 3. BACKUP FIRST, then migrate
pnpm db:backup
docker compose -f docker/compose.prod.yml --env-file .env.production \
  --profile tools run --rm migrate

# 4. Build the app image (uses the build_env secret)
docker compose -f docker/compose.prod.yml --env-file .env.production build app

# 5. Start the app behind Caddy
docker compose -f docker/compose.prod.yml --env-file .env.production up -d app caddy
```

`pnpm storage:setup` is idempotent: it creates the bucket if missing, enables
versioning (FR-046), and verifies both. Run it from the host instead only when
`S3_ENDPOINT` is an external S3 endpoint reachable from that host.

`migrate` uses `prisma migrate deploy` (`pnpm db:migrate:prod`): it applies
pending migrations only. Prisma migrations are forward-only — always take a
backup before running it.

## Verification after deploy

```bash
# Health (also used by Caddy and the container healthcheck)
curl -fsS https://$CADDY_DOMAIN/api/health

# Security headers (CSP, HSTS, nosniff, frame denial)
curl -sSI https://$CADDY_DOMAIN/en | grep -iE 'content-security-policy|strict-transport|nosniff|x-frame|referrer|permissions'

# Admin responses must not be cached
curl -sSI https://$CADDY_DOMAIN/en/admin | grep -i cache-control   # expect no-store

# Containers healthy, app non-root/read-only
docker compose -f docker/compose.prod.yml ps
```

Then walk the public site in both locales (RTL), sign in as each role, submit a
test inquiry/partnership request, verify media upload/serving and that the
`/api/media/{id}` proxy works, and confirm redirects.

## Backups

Schedule the `backup` profile from the host and configure
`BACKUP_S3_BUCKET` for an off-host copy. See
[`backup-and-restore.md`](./backup-and-restore.md). A backup that never leaves
the database host is not sufficient for disaster recovery.

## Rollback

1. Keep the previous `zein-app:<tag>` image (`APP_IMAGE_TAG`) available.
2. If a migration is involved, restore the pre-migration dump into a clean
   database (see the restore runbook); **do not** attempt to reverse migrations.
3. Start the previous image, confirm `/api/health`, then restore traffic.

## Hardening already applied

- `app` runs as `1001:1001`, `read_only`, `cap_drop: ALL`,
  `no-new-privileges`, with a `tmpfs` `/tmp` and a writable `.next/cache` volume.
- Secrets are supplied via env files and a BuildKit secret, never as build
  args; the image carries no database tooling.
- Caddy terminates TLS; the application owns security headers
  (`next.config.ts`) — see [`security-headers.md`](./security-headers.md).

## Known gaps before go-live

- Image digests for `CADDY_IMAGE` (and any other third-party images) are not
  pinned or verified in this environment. Pin by digest for reproducible
  deploys.
- Off-host backup and a staging deploy are still open.
- Client Open Items (domain, map provider, email/notification provider,
  analytics/consent, content, backups destination, roles) remain unresolved —
  see `specs/001-zain-b2b-platform/spec.md`.
