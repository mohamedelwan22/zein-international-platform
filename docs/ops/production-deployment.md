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
| `docker/compose.build.yml` | Build-window overlay: publishes postgres on host loopback only. | Yes |
| `docker/compose.staging.yml` | VPS-staging overlay: isolated, private S3Mock for media smoke-tests. | Yes |
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
reachable, migrated (and for a complete prerender, seeded) database. Compose
service DNS (`postgres`) is **not** resolvable from inside BuildKit, so the
build cannot simply point at `postgres:5432`. Validated approach (Linux VPS and
Docker Desktop):

1. For the build window only, publish the stack postgres on the host
   **loopback** with the overlay — never on a public interface:

   ```bash
   docker compose -f docker/compose.prod.yml -f docker/compose.build.yml \
     --env-file .env.production up -d postgres
   ```

2. The `app` build in `docker/compose.prod.yml` sets `build.network: host`, so
   BuildKit `RUN` steps share the host network namespace and can reach
   `127.0.0.1:5432`. `docker/.env.build` therefore uses
   `DATABASE_URL=postgresql://<user>:<pass>@127.0.0.1:5432/<db>`
   (override the port with `PG_BUILD_PORT` if 5432 is taken). This was verified
   end-to-end: a host-networked image build succeeded against a loopback-bound
   postgres, while nothing was published on non-loopback interfaces.

3. After the build, drop the loopback publish again (data lives in the
   `pgdata` volume):

   ```bash
   docker compose -f docker/compose.prod.yml --env-file .env.production up -d postgres
   ```

127.0.0.1 is not publicly reachable; do not change the binding in
`docker/compose.build.yml`. Verified NOT to work: `build.network: <compose
network name>` — BuildKit rejects arbitrary network names (`network mode
"<name>" not supported by buildkit`). A `docker-container` buildx builder with
`--driver-opt network=<network>` is the documented alternative, but it was not
verified in this environment (the `moby/buildkit` image could not be pulled —
registry connectivity); treat it as untested. A managed database reachable from
the build host also works and needs no overlay.

A complete, deterministic prerender also needs the seeded content rows. Never
put a production admin password in the build file.

## First run

```bash
# 0. Provision environment (never commit these files)
cp .env.example .env.production          # fill in real values
cp docker/.env.build.example docker/.env.build   # fill in build values (127.0.0.1 DATABASE_URL)
export BUILD_ENV_FILE="$PWD/docker/.env.build"

# 1. Validate the rendered configuration
docker compose -f docker/compose.prod.yml --env-file .env.production config --quiet

# 2. Data services first
#    (loopback-only publish for the build window; see "Build-time database")
docker compose -f docker/compose.prod.yml -f docker/compose.build.yml \
  --env-file .env.production up -d postgres

# 3. BACKUP FIRST, then migrate
pnpm db:backup
docker compose -f docker/compose.prod.yml --env-file .env.production \
  --profile tools run --rm migrate

# 4. FIRST DEPLOY ONLY: seed the approved profile content (idempotent).
#    Never part of the regular deploy path; requires ADMIN_EMAIL/ADMIN_PASSWORD
#    in .env.production. Re-running never overwrites staff edits.
docker compose -f docker/compose.prod.yml --env-file .env.production \
  --profile tools run --rm seed

# 5. Build the app image (build runs on host network; uses the build_env secret)
docker compose -f docker/compose.prod.yml --env-file .env.production build app

# 6. Drop the loopback-only publish and start the app behind Caddy
docker compose -f docker/compose.prod.yml --env-file .env.production up -d postgres
docker compose -f docker/compose.prod.yml --env-file .env.production up -d app caddy
```

Order matters: `postgres → migrate → seed → app build → app → caddy`. The
`next build` prerender reads the migrated **and seeded** database, so the app
image cannot be built before steps 3–4. Maintenance order: backup → migrate →
build → start. Seed is deliberately a manual, one-shot step.

`pnpm storage:setup` is idempotent: it creates the bucket if missing, enables
versioning (FR-046), and verifies both. Run it from the host instead only when
`S3_ENDPOINT` is an external S3 endpoint reachable from that host.

`migrate` uses `prisma migrate deploy` (`pnpm db:migrate:prod`): it applies
pending migrations only, from the `prisma` image stage (no app build needed).
`seed` uses `prisma db seed` from the same stage; it is manual/one-shot and
idempotent. Prisma migrations are forward-only — always take a backup before
running them.

## VPS staging with in-stack S3Mock

`docker/compose.staging.yml` is an **overlay** (use with `-f`, same project)
that adds a single isolated S3Mock service for staging media smoke-tests:

- Persistent dedicated volume `staging_s3mockdata`.
- **No published port** — reachable only on the Compose network
  (`http://s3mock:9090`); nothing is exposed to the internet.
- Set `S3_ENDPOINT=http://s3mock:9090` (plus placeholder `S3_*` values) in a
  git-ignored `.env.staging`. Runtime values for real production still point
  at an external S3 bucket.
- **S3Mock is not production-grade storage**: single process, no durability or
  security guarantees. Staging data is disposable; production must use an
  external S3-compatible bucket. Nothing in this overlay is a substitute for
  client-approved storage.
- The development S3Mock (`docker/compose.yaml`, host port 9100) is for local
  dev only and is unaffected.

```bash
docker compose -f docker/compose.prod.yml -f docker/compose.staging.yml \
  --env-file .env.staging up -d
```

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
