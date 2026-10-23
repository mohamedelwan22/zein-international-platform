#!/usr/bin/env node
/**
 * Media bucket provisioning — T115 (FR-046; plan.md "Backup/Recovery
 * Strategy": "Media: S3 versioning enabled").
 *
 * Idempotently provisions the S3-compatible media bucket:
 *   1. creates the bucket when it does not exist,
 *   2. enables bucket versioning (required by FR-046),
 *   3. optionally applies a lifecycle rule that expires noncurrent versions
 *      after MEDIA_LIFECYCLE_DAYS days.
 *
 * Usage:
 *   pnpm exec tsx scripts/setup-media-bucket.ts [--dry-run] [--help]
 *
 * Exit codes: 0 = the bucket is provisioned as requested, non-zero = failure.
 */

import "dotenv/config";

import type { LifecycleRule } from "@aws-sdk/client-s3";

const SCRIPT_NAME = "setup-media-bucket";
const DEFAULT_LIFECYCLE_DAYS = 30;
const LIFECYCLE_RULE_ID = "zein-noncurrent-expiration";

interface BucketOptions {
  help: boolean;
  dryRun: boolean;
  bucket: string | null;
  lifecycleDays: number | null;
}

function log(step: string, message: string): void {
  console.log(`${new Date().toISOString()} [${SCRIPT_NAME}] ${step} ${message}`);
}

function warn(message: string): void {
  console.warn(`${new Date().toISOString()} [${SCRIPT_NAME}] WARN ${message}`);
}

function error(message: string): void {
  console.error(`${new Date().toISOString()} [${SCRIPT_NAME}] ERROR ${message}`);
}

function printHelp(): void {
  console.log(
    [
      `${SCRIPT_NAME} — provision the S3-compatible media bucket (T115 / FR-046).`,
      "",
      "Usage:",
      "  pnpm exec tsx scripts/setup-media-bucket.ts [options]",
      "",
      "Options:",
      "  --help                    Show this help and exit.",
      "  --dry-run                 Print the plan only; no bucket is created or changed.",
      "  --bucket <name>           Bucket override (default: $S3_BUCKET).",
      "  --lifecycle-days <n>      Expire noncurrent versions after n days.",
      "                            (default: $MEDIA_LIFECYCLE_DAYS, otherwise the rule is skipped).",
      "",
      "What it does:",
      "  1. creates the bucket when it is missing (idempotent),",
      "  2. enables bucket versioning (required by FR-046) and verifies it,",
      "  3. applies/updates a noncurrent-version expiration lifecycle rule when a",
      "     retention value is configured (idempotent).",
      "",
      "Environment variables (names only — values are never logged):",
      "  S3_ENDPOINT               S3-compatible endpoint (for example the MinIO service).",
      "  S3_BUCKET                 Media bucket name (default zein-media).",
      "  S3_REGION                 Region for the bucket.",
      "  S3_ACCESS_KEY             Access key.",
      "  S3_SECRET_KEY             Secret key.",
      "  MEDIA_LIFECYCLE_DAYS      Days after which noncurrent versions are expired.",
      "",
      "Exit codes: 0 = success, non-zero = failure.",
    ].join("\n"),
  );
}

function parseOptions(argv: string[]): BucketOptions {
  const options: BucketOptions = {
    help: false,
    dryRun: false,
    bucket: process.env["S3_BUCKET"] ?? null,
    lifecycleDays: null,
  };

  const envLifecycle = process.env["MEDIA_LIFECYCLE_DAYS"];
  if (envLifecycle !== undefined) {
    const parsed = envLifecycle.trim() === "" ? DEFAULT_LIFECYCLE_DAYS : Number.parseInt(envLifecycle, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("MEDIA_LIFECYCLE_DAYS must be a non-negative integer");
    }
    options.lifecycleDays = parsed;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for option ${arg}`);
      }
      index += 1;
      return value;
    };
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--bucket":
        options.bucket = next();
        break;
      case "--lifecycle-days": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error("--lifecycle-days must be a non-negative integer");
        }
        options.lifecycleDays = value;
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isMissingBucket(failure: unknown): boolean {
  if (typeof failure !== "object" || failure === null) {
    return false;
  }
  const candidate = failure as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const name = candidate.name ?? candidate.Code ?? "";
  if (name === "NotFound" || name === "NoSuchBucket" || name === "NotFoundException") {
    return true;
  }
  return candidate.$metadata?.httpStatusCode === 404;
}

/**
 * S3-compatible stores answer `GetBucketLifecycleConfiguration` with an error
 * (instead of an empty result) when the bucket has no lifecycle configuration
 * yet. That case must not abort the provisioning run.
 */
function isMissingLifecycle(failure: unknown): boolean {
  if (typeof failure !== "object" || failure === null) {
    return false;
  }
  const candidate = failure as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const name = candidate.name ?? candidate.Code ?? "";
  if (name === "NoSuchLifecycleConfiguration" || name === "NoSuchLifecycle") {
    return true;
  }
  if (candidate.$metadata?.httpStatusCode === 404) {
    return true;
  }
  return errorMessage(failure).toLowerCase().includes("does not exist");
}

function errorMessage(failure: unknown): string {
  if (failure instanceof Error) {
    return failure.message;
  }
  return String(failure);
}

async function main(): Promise<void> {
  let options: BucketOptions;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (parseError) {
    error(String(parseError instanceof Error ? parseError.message : parseError));
    console.error("Run with --help for usage.");
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const bucket = options.bucket ?? "zein-media";
  const accessKey = process.env["S3_ACCESS_KEY"];
  const secretKey = process.env["S3_SECRET_KEY"];
  const endpoint = process.env["S3_ENDPOINT"] ?? "http://localhost:9000";
  const region = process.env["S3_REGION"] ?? "us-east-1";

  if (!accessKey || !secretKey) {
    error(
      "S3_ACCESS_KEY / S3_SECRET_KEY are not set — the bucket cannot be provisioned. Export the storage credentials and retry.",
    );
    process.exitCode = 1;
    return;
  }

  log("plan", `bucket=${bucket} endpoint=${endpoint} region=${region}`);
  log("plan", "action=create-bucket-if-missing");
  log("plan", "action=enable-versioning");
  log(
    "plan",
    options.lifecycleDays === null
      ? "action=lifecycle (skipped — MEDIA_LIFECYCLE_DAYS is not set)"
      : `action=lifecycle noncurrent-expiration=${options.lifecycleDays}d`,
  );

  if (options.dryRun) {
    log("dry-run", "No bucket was created, changed or queried.");
    return;
  }

  let sdk: typeof import("@aws-sdk/client-s3");
  try {
    sdk = await import("@aws-sdk/client-s3");
  } catch (importError) {
    error(
      `The "@aws-sdk/client-s3" package could not be loaded (${String(
        importError,
      )}). Run the script from a checkout with production dependencies installed.`,
    );
    process.exitCode = 1;
    return;
  }

  const client = new sdk.S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  let bucketState = "existing";
  try {
    await client.send(new sdk.HeadBucketCommand({ Bucket: bucket }));
    log("bucket", `status=exists name=${bucket}`);
  } catch (headFailure) {
    if (!isMissingBucket(headFailure)) {
      error(`HeadBucket failed for "${bucket}": ${errorMessage(headFailure)}`);
      process.exitCode = 1;
      return;
    }
    try {
      await client.send(new sdk.CreateBucketCommand({ Bucket: bucket }));
      bucketState = "created";
      log("bucket", `status=created name=${bucket}`);
    } catch (createFailure) {
      const name = (createFailure as { name?: string }).name ?? "";
      if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") {
        bucketState = "existing";
        log("bucket", `status=exists name=${bucket} (already present)`);
      } else {
        error(`CreateBucket failed for "${bucket}": ${errorMessage(createFailure)}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  try {
    await client.send(
      new sdk.PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: "Enabled" } }),
    );
    log("versioning", "action=enable status=sent");
  } catch (versioningFailure) {
    error(`PutBucketVersioning failed for "${bucket}": ${errorMessage(versioningFailure)}`);
    process.exitCode = 1;
    return;
  }

  let versioningEnabled = false;
  try {
    const versioning = await client.send(new sdk.GetBucketVersioningCommand({ Bucket: bucket }));
    versioningEnabled = versioning.Status === "Enabled";
    log("versioning", `status=${versioning.Status ?? "unset"}`);
  } catch (versioningReadFailure) {
    error(`GetBucketVersioning failed for "${bucket}": ${errorMessage(versioningReadFailure)}`);
    process.exitCode = 1;
    return;
  }

  if (!versioningEnabled) {
    error(
      `Bucket versioning is still not enabled on "${bucket}" — FR-046 requires versioning for media recoverability.`,
    );
    process.exitCode = 1;
    return;
  }

  let lifecycleDetail = "not configured (MEDIA_LIFECYCLE_DAYS is unset)";
  if (options.lifecycleDays !== null) {
    let existingRules: LifecycleRule[] = [];
    try {
      const existing = await client.send(
        new sdk.GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
      );
      existingRules = existing.Rules ?? [];
    } catch (readFailure) {
      if (!isMissingLifecycle(readFailure)) {
        error(
          `GetBucketLifecycleConfiguration failed for "${bucket}": ${errorMessage(
            readFailure,
          )} — the retention rule was NOT applied.`,
        );
        process.exitCode = 1;
        return;
      }
      existingRules = [];
      log("lifecycle", "status=no-existing-configuration");
    }

    try {
      const rules = existingRules.filter((rule) => rule.ID !== LIFECYCLE_RULE_ID);
      rules.push({
        ID: LIFECYCLE_RULE_ID,
        Status: "Enabled",
        Filter: {},
        NoncurrentVersionExpiration: { NoncurrentDays: options.lifecycleDays },
      });
      await client.send(
        new sdk.PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: { Rules: rules },
        }),
      );
      lifecycleDetail = `noncurrent versions expire after ${options.lifecycleDays} days (rule ${LIFECYCLE_RULE_ID})`;
      log("lifecycle", `status=applied ${lifecycleDetail}`);
    } catch (lifecycleFailure) {
      error(
        `PutBucketLifecycleConfiguration failed for "${bucket}": ${errorMessage(
          lifecycleFailure,
        )} — versioning stays enabled, the retention rule is NOT applied.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    warn(
      "MEDIA_LIFECYCLE_DAYS is not set — noncurrent media versions accumulate indefinitely on this bucket.",
    );
  }

  log("summary", `bucket=${bucket} state=${bucketState} versioning=ENABLED`);
  log("summary", `lifecycle=${lifecycleDetail}`);

  const offHostBucket = process.env["BACKUP_S3_BUCKET"];
  if (!offHostBucket) {
    warn(
      "BACKUP_S3_BUCKET is not configured — the media bucket is not a backup destination. Versioning protects against accidental overwrite, not against loss of the whole storage host.",
    );
  } else {
    log("summary", `off-host backup bucket configured=${offHostBucket}`);
  }
  warn(
    "Operational blocker: database backups are a separate concern — this script does not protect PostgreSQL. See docs/ops/backup-and-restore.md.",
  );
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/setup-media-bucket.ts");
if (isDirectRun) {
  main().catch((mainError) => {
    error(mainError instanceof Error ? mainError.stack ?? mainError.message : String(mainError));
    process.exitCode = 1;
  });
}
