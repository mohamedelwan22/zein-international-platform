# Dependency audit register (T110 / T118)

Last reviewed: 2026-10-28 · Tooling: `pnpm audit` (pnpm 11.2.2) · Lockfile: `pnpm-lock.yaml`

## Gate

```sh
pnpm verify:deps                  # release gate: unfiltered audit + registry probe
pnpm verify:deps --report f.json  # offline evaluation only (NOT a release gate)
pnpm audit                        # raw registry report (informational, exit 1 on findings)
```

`scripts/verify-dependency-audit.ts` runs `pnpm audit --json`, validates the
report structure strictly, and evaluates it. The previously reported Zod
advisory is resolved: the lockfile now contains only `zod@4.6.7`, which is
patched for GHSA-mrhx-c7xc-m3w5. The four `fast-uri` advisories are resolved
with a narrow pnpm workspace override to `fast-uri@3.1.9`. The package is
selected by the Prisma 7.10.1 development chain (`prisma > @prisma/dev >
@prisma/streams-local > ajv`), and `ajv@8.20.0` declares `fast-uri: ^3.0.1`,
which includes patched `3.1.9`. No Prisma API or runtime package was changed.
The override must be re-evaluated when Prisma publishes a dependency update
that naturally resolves `fast-uri@3.1.9` or later.

| Exit | Meaning |
| --- | --- |
| 0 | Clean audit (0 advisories), **or** only the registered (currently withdrawn) advisory and the registry confirms no patched release exists |
| 1 | Violation: unexpected advisory, exception drift, or a patched release is now published |
| 2 | Invalid/unexpected audit output, malformed JSON, failed command, or suppression config detected |
| 3 | Registry state indeterminate (timeout/network/parse failure) — **not** treated as clean |

CI (`.github/workflows/ci.yml`, job `audit`) prints the raw `pnpm audit` report
informational first (failure tolerated), then enforces `pnpm verify:deps`. The
gate step has no `continue-on-error`, so its exit code fails the job.

### Fail-closed report validation

The evaluator does not trust an empty or partial response. It requires a JSON
object with an `advisories` object (numeric keys, complete advisory records with
non-empty `findings` and non-empty `paths`) and a `metadata.vulnerabilities`
map whose per-severity counts match the advisories. These all fail:

- `{}`, `{"advisories":null}`, missing `metadata`/`metadata.vulnerabilities`
- `{"error":{"code":"ENETUNREACH"}}` and any other registry error payload
- truncated or non-JSON stdout
- malformed JSON
- a `pnpm audit` exit code other than 0 (clean) or 1 (findings), a signal
  termination, or a spawn failure

A non-zero exit is accepted **only** when it is 1 *and* a complete report was
printed; everything else exits 2.

### Registry patch probe

The advisory metadata already advertises `patched_versions >=3.0.4` while no
such release exists on npm, so comparing that string cannot detect a fix. The
release gate therefore fetches the abbreviated packument for `braces` from the
configured registry (`NPM_CONFIG_REGISTRY`/`npm_config_registry`, default
`https://registry.npmjs.org`) with a 10 s timeout
(`DEFAULT_REGISTRY_TIMEOUT_MS`) and checks whether any published version
satisfies the advisory's patched range.

- A published satisfying version → **FAIL** (exit 1): upgrade and remove the
  exception.
- No published satisfying version → the temporary exception is still valid.
- Network error, timeout, empty/unparseable packument, or a patched range the
  evaluator cannot parse → **INDETERMINATE** (exit 3): never reported as clean.

`--report <file>` evaluates a captured report offline and **skips** the registry
probe; it prints a warning that the result is not a release-gate result. It
exists for CI log reproduction and unit testing.

### Suppression guard

No YAML parser is available in the runtime dependency tree, and adding one for
this single check is not warranted. The guard therefore strips YAML comments and
rejects any remaining `auditConfig` key (block or flow style, quoted or bare) or
`ignoreGhsas` token. The gate refuses to run (exit 2) if either appears in
`pnpm-workspace.yaml`.

### Why not `pnpm audit --ignore`

pnpm 11.2.2's `--ignore <vulnerability>` is unusable as a release gate. Measured
on a clean copy of `package.json` + `pnpm-lock.yaml` (only the known `braces`
advisory present):

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm audit` | **1** | reports the `braces` advisory |
| `pnpm audit --ignore=GHSA-vfj7-8cjw-p6xm` | 0 | ignores the advisory |
| `pnpm audit --ignore=GHSA-0000-0000-0000` (non-existent) | **0** | still ignores it — the ID is not matched |
| `pnpm audit --ignore=AAA,BBB` | **0** | ignores it; persists a single `AAA BBB` entry |

The flag suppresses *all* advisories regardless of the value and writes the
value into `pnpm-workspace.yaml` as `auditConfig.ignoreGhsas` (uncommitted
working-tree change). The versioned `auditConfig.ignoreGhsas` mechanism itself
matches IDs correctly (a bogus entry does not hide the advisory), but it filters
the report before any check can see what was hidden, so this project does not
rely on it.

## Resolved fast-uri advisories

| Advisory | Package | Severity | Installed | Patched | Dependency path |
| --- | --- | --- | --- | --- | --- |
| GHSA-w74x-v6f9-j3xg | `fast-uri` | Moderate | 3.1.8 | 3.1.9 | `. > @prisma/client > prisma > @prisma/dev > @prisma/streams-local > ajv > fast-uri` |
| GHSA-xhq7-xmqj-769h | `fast-uri` | Low | 3.1.8 | 3.1.9 | same path |
| GHSA-wjr9-j795-jxcr | `fast-uri` | Moderate | 3.1.8 | 3.1.9 | same path |
| GHSA-333x-w4r6-6crp | `fast-uri` | Low | 3.1.8 | 3.1.9 | same path |

The authoritative GitHub Advisory Database records all four advisories as
patched in `fast-uri@3.1.9`. `pnpm install --frozen-lockfile` and
`pnpm verify:deps` validate the current override and resolved lockfile. The
safe maintenance step is to remove the override only after a Prisma or
`@prisma/dev`/AJV release naturally resolves to `fast-uri@3.1.9` or later and
the audit remains clean.

## Withdrawn advisory (no active exception)

| Field | Value |
| --- | --- |
| Advisory | **GHSA-vfj7-8cjw-p6xm** (CVE-2026-93687) |
| Package | `braces` (vulnerable `<=3.0.3`, advisory advertised patched `>=3.0.4`) |
| Severity | High (stack-exhaustion DoS via deeply nested patterns) |
| Dependency path | `. > eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces` |
| Exposure | **Development only.** `eslint-config-next` is a `devDependency`; the package is absent from the production standalone build. |
| Status | **Withdrawn by the GitHub Advisory Database on 2026-10-23** ("not a practically exploitable vulnerability"). `pnpm audit` reports **0** advisories; there is no active exception. |
| Upstream | `braces@3.0.4` is still unpublished (registry latest `3.0.3`); `micromatch@4.0.8` declares `braces@^3.0.3`; `@next/eslint-plugin-next@16.4.2` pins `fast-glob@3.3.1`. No override is used. |
| Register entry | Retained in `scripts/verify-dependency-audit.ts` only so a republication cannot silently pass. The registry probe still fails the gate if a satisfying release is later published. |

## Remediated: Next.js advisories (2026-10-23)

Three production advisories against `next@16.4.0` were cleared by upgrading to
`next@16.4.2` (and aligning `eslint-config-next@16.4.2`):

| GHSA | Module | Severity | Summary |
| --- | --- | --- | --- |
| GHSA-2464-fhr4-w9xw | `next` | critical | Unauthenticated RCE in the Image Optimization API with SVG files |
| GHSA-673q-mjm6-r5xr | `next` | critical | Unauthenticated RCE in `use cache` functions returning typed arrays |
| GHSA-p3m5-59mp-jv5r | `next` | high | Denial of service in App Router Server Actions |

Affected range was `>=16.0.0 <=16.4.0` (patched `>=16.4.1`); `16.4.2` is a
published patched release. Paths `. > next`, `. > next-auth > next`,
`. > next-intl > next` are now clean.

## Resolved in Phase 15

`prisma`, `@prisma/client` and `@prisma/adapter-pg` were upgraded from the
original 7.x pin to **`^7.10.1`**, which ships `mysql2@3.24.4` (Prisma CLI) and
`deepmerge-ts@8.0.2` (`@prisma/config`), clearing the three Prisma-toolchain
advisories present in the baseline audit.

## Verification commands

```sh
pnpm verify:deps
pnpm why braces
pnpm why micromatch
pnpm why fast-glob
pnpm audit --json | jq '.advisories | length'
```

## Known operational gap

- **Object storage:** production uses an external S3-compatible bucket (no in-stack MinIO). `docker/compose.yaml` now uses `mirror.gcr.io/adobe/s3mock:latest` for local dev only; `docker/compose.prod.yml` has no MinIO service. The `MINIO_IMAGE` variable is obsolete and should not be used. If you mirror images for air-gapped hosts, pin by digest (`mirror.gcr.io/library/postgres:17`, `mirror.gcr.io/adobe/s3mock:latest`, `caddy:2-alpine`).
- **Image pinning:** `CADDY_IMAGE` is not pinned by digest in this environment; pin by digest for reproducible deploys. CI pulls `mirror.gcr.io/library/postgres:17` and `mirror.gcr.io/adobe/s3mock:latest` (verified manifests/digests). Remove `minio/minio` references if present anywhere else.
