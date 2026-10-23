# Backup and restore

Operational runbook for PostgreSQL backups, off-host retention, and the
restore drill (SC-015, FR-046). Everything here is derived from
`scripts/backup-postgres.ts`, `scripts/verify-backup.ts`, and
`scripts/restore-drill.ts`.

> **Status:** a real backup and a passing isolated restore drill are recorded
> under `docs/ops/restore-drills/`. Off-host backup (`BACKUP_S3_BUCKET`) is
> still **NOT CONFIGURED** in this environment and is a pre-production
> blocker until the client supplies a destination bucket.

## What a backup contains

`pnpm db:backup` produces a custom-format PostgreSQL dump
(`pg_dump -Fc`) of `DATABASE_URL`, verifies it with `pg_restore --list`,
writes a SHA-256 sidecar, rotates only files it owns inside the backup
directory, and (optionally) uploads the dump to an S3-compatible bucket.
The script never claims an off-host copy exists unless the upload succeeded
(it exits non-zero otherwise).

MinIO/S3 **media is not covered by this dump**. Media durability relies on
bucket versioning, which `pnpm storage:setup` enables (FR-046). Object
versioning is not a substitute for a database backup, and a database dump is
not a substitute for object-storage replication.

## Commands

```bash
# Local/CI-style backup into BACKUP_DIR (default ./backups)
pnpm db:backup

# Explicit options
pnpm db:backup --dir /var/backups/zein --retention-days 30 --bucket zein-backups

# Re-verify the newest dump in a directory (checksum sidecar + object-list)
pnpm db:backup:verify --dir /var/backups/zein

# Restore drill into an EMPTY, isolated database (never the source)
pnpm db:restore:drill \
  --dump /var/backups/zein/zein-<stamp>.dump \
  --target-database-url postgresql://<user>:<password>@<host>:<port>/<drill-db>
```

Use `--help` on any script for the full flag list, and `--dry-run` to print the
plan without touching the filesystem or database.

### Required / optional environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Source database for `db:backup`. Never printed by the scripts. |
| `BACKUP_DIR` | Output directory (default `./backups`, git-ignored). |
| `BACKUP_RETENTION_DAYS` | Rotation window (default 30). |
| `BACKUP_LABEL` | Optional filename label (`[A-Za-z0-9_-]`). |
| `BACKUP_S3_BUCKET` | Off-host bucket. **When unset, no off-host copy is made.** |
| `BACKUP_S3_PREFIX` | Key prefix (default `backups/`). |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Off-host destination credentials. |
| `BACKUP_COMMAND_TIMEOUT_MS` | Per-command timeout (default 900000). |
| `PG_DUMP_BIN`, `PG_RESTORE_BIN` | Explicit client binaries (otherwise resolved from `PATH`). |
| `PG_CONTAINER` | Run `pg_dump`/`pg_restore` via `docker exec` in this container (no host client needed). |
| `PG_CONTAINER_HOST`, `PG_CONTAINER_PORT` | Database address as seen from inside that container (default `localhost:5432`). |

## Scheduling

Run the backup from the host, not the app container (the runtime image is
read-only and deliberately has no database tooling):

```bash
# cron (daily 02:15 UTC)
15 2 * * * cd /srv/zein && BACKUP_S3_BUCKET=zein-backups pnpm db:backup >>/var/log/zein-backup.log 2>&1
```

In the production Compose stack, the equivalent one-shot service is:

```bash
docker compose -f docker/compose.prod.yml --env-file .env.production \
  --profile tools run --rm backup
```

It writes to the `backups` volume and prunes dumps older than 30 days. Add the
off-host copy by configuring `BACKUP_S3_BUCKET` in `.env.production` (the
Compose `backup` service uses the plain PostgreSQL image and `pg_dump`; use
`pnpm db:backup` on the host when you need the upload path).

## Restore procedure (disaster recovery)

1. **Stop writers.** Take the app out of rotation / stop the `app` service so
   no new writes occur during the restore.
2. **Back up the current state first**, even if it is broken:
   `pnpm db:backup --label pre-restore`.
3. **Provision a clean database** (empty `zein_restore_drill`-style target).
   Never restore over the live database in place.
4. **Restore and verify:**
   ```bash
   pnpm db:restore:drill --dump <dump> --target-database-url <clean-db-url>
   ```
   The drill script uses `pg_restore --no-owner --no-privileges --exit-on-error`
   and **never** `--clean`. It verifies the checksum and object list before
   restoring, then checks the restored schema/content and writes a dated report
   under `docs/ops/restore-drills/`.
5. **Spot-check** published content, media references (objects must still exist
   in the bucket), admin login, one lead submission, and redirects.
6. **Cut over** by pointing `DATABASE_URL` at the restored database, restart the
   app, and confirm `/api/health` plus a representative page render.
7. Record date, dump id, SHA-256, findings, and observed RTO in the evidence
   file.

## Evidence and targets

- Drill evidence: `docs/ops/restore-drills/<date>-<stamp>.md`.
- The latest recorded drill completed successfully against an isolated
  database with `pg_restore --no-owner --no-privileges` (no `--clean`).
- Target RPO is the backup schedule (daily ⇒ ≤ 24 h). Target RTO is the
  restore-drill duration plus cut-over; record the measured value per drill.
- **Open blocker:** off-host backup is not configured until a real
  `BACKUP_S3_BUCKET` and credentials are supplied, so the current backup lives
  on the same host as the database.
