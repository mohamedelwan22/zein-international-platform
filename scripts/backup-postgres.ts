#!/usr/bin/env node
/**
 * PostgreSQL backup tool — T115 (FR-046; plan.md "Backup/Recovery Strategy").
 *
 * Produces a custom-format dump (`pg_dump -Fc`) of the database named by
 * DATABASE_URL, records a SHA-256 checksum in a sidecar file, verifies the
 * archive with `pg_restore --list`, rotates expired dumps inside the backup
 * directory only, and can copy the dump to an off-host S3-compatible bucket.
 *
 * The script never writes credentials to disk or to the log, and it never
 * claims that an off-host copy exists unless the upload actually succeeded.
 *
 * Usage:
 *   pnpm exec tsx scripts/backup-postgres.ts [--dry-run] [--help]
 *       [--dir <path>] [--retention-days <n>] [--bucket <name>]
 *       [--no-upload] [--label <text>]
 *
 * Exit codes: 0 = success, non-zero = failure.
 */

import "dotenv/config";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SCRIPT_NAME = "backup-postgres";
const DEFAULT_DIR = "./backups";
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DUMP_FILE_PATTERN = /^zein-\d{8}T\d{6}Z(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?\.dump$/;

interface PostgresTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface ToolSpec {
  /** "local" runs the binary on this host; "container" runs it via `docker exec`. */
  kind: "local" | "container";
  /** Absolute path of the binary (local) or command name inside the container. */
  binary: string;
  /** Container name (container mode only). */
  container: string;
  /** Host/port of the database as seen from inside the container. */
  containerHost: string;
  containerPort: number;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
}

interface BackupOptions {
  help: boolean;
  dryRun: boolean;
  dir: string;
  retentionDays: number;
  bucket: string | null;
  upload: boolean;
  label: string | null;
}

interface RotationPlan {
  deleted: string[];
  kept: string[];
  protectedNewest: string | null;
}

// ---------------------------------------------------------------------------
// Logging (plain console output — one line per step, ISO timestamps)
// ---------------------------------------------------------------------------

function log(step: string, message: string): void {
  console.log(`${new Date().toISOString()} [${SCRIPT_NAME}] ${step} ${message}`);
}

function warn(message: string): void {
  console.warn(`${new Date().toISOString()} [${SCRIPT_NAME}] WARN ${message}`);
}

function error(message: string): void {
  console.error(`${new Date().toISOString()} [${SCRIPT_NAME}] ERROR ${message}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(
    [
      `${SCRIPT_NAME} — PostgreSQL custom-format backup (T115 / FR-046).`,
      "",
      "Usage:",
      "  pnpm exec tsx scripts/backup-postgres.ts [options]",
      "",
      "Options:",
      "  --help                 Show this help and exit.",
      "  --dry-run              Print the plan only; nothing is created, written or deleted.",
      "  --dir <path>           Backup directory (default: $BACKUP_DIR or ./backups).",
      "  --retention-days <n>   Retention window in days (default: $BACKUP_RETENTION_DAYS or 30).",
      "  --bucket <name>        Off-host bucket override (default: $BACKUP_S3_BUCKET).",
      "  --no-upload            Never attempt the off-host upload.",
      "  --label <text>         Extra label added to the dump file name.",
      "",
      "Environment variables (names only — values are never logged):",
      "  DATABASE_URL              Source database (required).",
      "  BACKUP_DIR                Backup directory (default ./backups).",
      "  BACKUP_RETENTION_DAYS     Retention in days (default 30).",
      "  BACKUP_LABEL              Extra label for the dump file name.",
      "  BACKUP_S3_BUCKET          Off-host bucket; when unset NO off-host copy is made.",
      "  BACKUP_S3_PREFIX          Key prefix inside the off-host bucket (default backups/).",
      "  BACKUP_COMMAND_TIMEOUT_MS Timeout for external commands in ms (default 900000).",
      "  S3_ENDPOINT               S3-compatible endpoint for the off-host bucket.",
      "  S3_REGION                 Region for the off-host bucket.",
      "  S3_ACCESS_KEY             Access key for the off-host bucket.",
      "  S3_SECRET_KEY             Secret key for the off-host bucket.",
      "  PG_DUMP_BIN               Explicit path to pg_dump (default: resolved from PATH).",
      "  PG_RESTORE_BIN            Explicit path to pg_restore (default: resolved from PATH).",
      "  PG_CONTAINER              Run pg_dump/pg_restore inside this container via `docker exec`.",
      "  PG_CONTAINER_HOST         Database host as seen from inside that container (default localhost).",
      "  PG_CONTAINER_PORT         Database port as seen from inside that container (default 5432).",
      "",
      "Exit codes: 0 = success, non-zero = failure.",
    ].join("\n"),
  );
}

function parseOptions(argv: string[]): BackupOptions {
  const options: BackupOptions = {
    help: false,
    dryRun: false,
    dir: process.env["BACKUP_DIR"] ?? DEFAULT_DIR,
    retentionDays: Number.parseInt(process.env["BACKUP_RETENTION_DAYS"] ?? "", 10) || DEFAULT_RETENTION_DAYS,
    bucket: process.env["BACKUP_S3_BUCKET"] ?? null,
    upload: true,
    label: process.env["BACKUP_LABEL"] ?? null,
  };

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
      case "--dir":
        options.dir = next();
        break;
      case "--retention-days": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error("--retention-days must be a non-negative integer");
        }
        options.retentionDays = value;
        break;
      }
      case "--bucket":
        options.bucket = next();
        break;
      case "--no-upload":
        options.upload = false;
        break;
      case "--label":
        options.label = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.label !== null && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(options.label)) {
    throw new Error("--label may only contain letters, digits, dash and underscore");
  }

  return options;
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function parseDatabaseUrl(raw: string): PostgresTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error("DATABASE_URL does not name a database");
  }
  return {
    host: url.hostname || "localhost",
    port: url.port ? Number.parseInt(url.port, 10) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

function findExecutable(name: string, explicit?: string): string | null {
  const candidates = explicit ? [explicit] : [name];
  const pathEnv = process.env["PATH"] ?? "";
  const directories = pathEnv.split(path.delimiter).filter((entry) => entry.length > 0);
  const extensions =
    process.platform === "win32"
      ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").filter((entry) => entry.length > 0)
      : [""];

  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    for (const directory of directories) {
      for (const extension of extensions) {
        const fullPath = path.join(directory, candidate + extension);
        if (existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  }
  return null;
}

function timeoutMs(): number {
  const configured = Number.parseInt(process.env["BACKUP_COMMAND_TIMEOUT_MS"] ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function containsGitSegment(target: string): boolean {
  return path
    .normalize(target)
    .split(/[\\/]+/)
    .some((segment) => segment === ".git");
}

async function isCoveredByGitignore(directory: string): Promise<boolean> {
  const gitignorePath = path.resolve(process.cwd(), ".gitignore");
  if (!existsSync(gitignorePath)) {
    return false;
  }
  const content = await readFile(gitignorePath, "utf8");
  const relative = path.relative(process.cwd(), directory).split(path.sep).join("/");
  const patterns = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return patterns.some((pattern) => {
    const normalized = pattern.replace(/^\/+/, "").replace(/\/+$/, "");
    return normalized === relative || normalized === path.basename(relative);
  });
}

// ---------------------------------------------------------------------------
// External command execution
// ---------------------------------------------------------------------------

function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; inputFile?: string } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: options.env ?? process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: string | null = null;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs());

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (spawnFailure: Error) => {
      spawnError = spawnFailure.message;
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, spawnError });
    });

    if (options.inputFile) {
      const source = createReadStream(options.inputFile);
      source.on("error", () => {
        child.stdin.end();
      });
      source.pipe(child.stdin);
    } else {
      child.stdin.end();
    }
  });
}

function runCommandToFile(
  command: string,
  args: string[],
  outputPath: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: options.env ?? process.env });
    const output = createWriteStream(outputPath);
    let stderr = "";
    let timedOut = false;
    let spawnError: string | null = null;
    const stdout = "";
    let settled = false;
    let childClosed = false;
    let outputFinished = false;
    let childCode: number | null = null;

    const finish = (): void => {
      if (settled || !childClosed || !outputFinished) {
        return;
      }
      settled = true;
      resolve({ code: childCode, stdout, stderr, timedOut, spawnError });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs());

    child.stdout.on("data", (chunk: Buffer | string) => {
      // Streamed to the archive file below; NEVER decode or accumulate it —
      // a custom-format dump is binary and utf8 round-tripping corrupts it.
      void chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (spawnFailure: Error) => {
      spawnError = spawnFailure.message;
    });
    child.stdout.pipe(output);
    output.on("error", () => {
      child.kill("SIGTERM");
    });
    output.on("finish", () => {
      outputFinished = true;
      finish();
    });
    child.on("close", (code: number | null) => {
      childCode = code;
      childClosed = true;
      clearTimeout(timer);
      if (!output.writableEnded) {
        output.end();
      }
      finish();
    });
  });
}

// ---------------------------------------------------------------------------
// Tool resolution
// ---------------------------------------------------------------------------

function resolveTool(kind: "dump" | "restore"): ToolSpec {
  const container = process.env["PG_CONTAINER"] ?? "";
  if (container) {
    const docker = findExecutable("docker");
    if (!docker) {
      throw new Error(
        "PG_CONTAINER is set but the `docker` executable was not found on PATH. Install Docker or unset PG_CONTAINER and install the PostgreSQL client tools.",
      );
    }
    return {
      kind: "container",
      binary: docker,
      container,
      containerHost: process.env["PG_CONTAINER_HOST"] ?? "localhost",
      containerPort: Number.parseInt(process.env["PG_CONTAINER_PORT"] ?? "5432", 10),
    };
  }

  const binaryName = kind === "dump" ? "pg_dump" : "pg_restore";
  const explicit =
    kind === "dump" ? process.env["PG_DUMP_BIN"] : process.env["PG_RESTORE_BIN"];
  const resolved = findExecutable(binaryName, explicit);
  if (!resolved) {
    throw new Error(
      `${binaryName} was not found. Install the PostgreSQL client tools (version 17 to match the server) or set ${
        kind === "dump" ? "PG_DUMP_BIN" : "PG_RESTORE_BIN"
      } to an absolute path, or set PG_CONTAINER to run it inside an existing PostgreSQL container.`,
    );
  }
  return {
    kind: "local",
    binary: resolved,
    container: "",
    containerHost: "",
    containerPort: 0,
  };
}

interface ToolInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function buildDumpInvocation(
  tool: ToolSpec,
  target: PostgresTarget,
  dumpPath: string,
): ToolInvocation {
  const connectionArgs = [
    "-h",
    tool.kind === "container" ? tool.containerHost : target.host,
    "-p",
    String(tool.kind === "container" ? tool.containerPort : target.port),
    "-U",
    target.user,
    "-d",
    target.database,
    "-Fc",
    "--no-password",
  ];

  if (tool.kind === "local") {
    return {
      command: tool.binary,
      args: [...connectionArgs, "-f", dumpPath],
      env: { ...process.env, PGPASSWORD: target.password },
    };
  }

  // Inside a container the archive is streamed to stdout (pg_dump's default
  // when no -f is given) so the file is written on the host. Note: passing
  // `-f -` is NOT equivalent here — on some pg_dump builds it produces an
  // empty archive with exit code 0, which would look like a silent failure.
  return {
    command: tool.binary,
    args: [
      "exec",
      "-e",
      `PGPASSWORD=${target.password}`,
      tool.container,
      "pg_dump",
      ...connectionArgs,
    ],
    env: { ...process.env },
  };
}

// ---------------------------------------------------------------------------
// Dump / verification
// ---------------------------------------------------------------------------

function timestampSlug(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function listArchive(tool: ToolSpec, dumpPath: string, target: PostgresTarget): Promise<CommandResult> {
  if (tool.kind === "local") {
    return runCommand(tool.binary, ["--list", dumpPath], { env: { ...process.env, PGPASSWORD: target.password } });
  }
  return runCommand(
    tool.binary,
    ["exec", "-i", "-e", `PGPASSWORD=${target.password}`, tool.container, "pg_restore", "--list"],
    { inputFile: dumpPath },
  );
}

function countArchiveObjects(listing: string): number {
  return listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(";")).length;
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

async function rotate(directory: string, retentionDays: number, protectedDump: string): Promise<RotationPlan> {
  const plan: RotationPlan = { deleted: [], kept: [], protectedNewest: null };
  const entries = await readdir(directory, { withFileTypes: true });
  const dumps = entries
    .filter((entry) => entry.isFile() && DUMP_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (dumps.length === 0) {
    return plan;
  }

  const stats = new Map<string, number>();
  for (const name of dumps) {
    const info = await stat(path.join(directory, name));
    stats.set(name, info.mtimeMs);
  }

  const newest = dumps.reduce((best, name) =>
    (stats.get(name) ?? 0) > (stats.get(best) ?? 0) ? name : best,
  );
  plan.protectedNewest = newest;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of dumps) {
    const fullPath = path.resolve(directory, name);
    if (path.dirname(fullPath) !== path.resolve(directory)) {
      throw new Error(`Refusing to touch ${fullPath} — outside the backup directory`);
    }
    const age = stats.get(name) ?? 0;
    const expired = age < cutoff;
    if (name === newest || name === protectedDump || !expired) {
      plan.kept.push(name);
      continue;
    }
    await rm(fullPath, { force: true });
    await rm(`${fullPath}.sha256`, { force: true });
    plan.deleted.push(name);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Off-host upload
// ---------------------------------------------------------------------------

interface UploadOutcome {
  attempted: boolean;
  uploaded: boolean;
  bucket: string | null;
  key: string | null;
  detail: string;
}

async function uploadOffHost(
  dumpPath: string,
  checksumPath: string,
  bucket: string | null,
): Promise<UploadOutcome> {
  if (!bucket) {
    return {
      attempted: false,
      uploaded: false,
      bucket: null,
      key: null,
      detail:
        "BACKUP_S3_BUCKET is not configured — NO off-host copy was made; this dump exists only on the local disk.",
    };
  }

  const accessKey = process.env["S3_ACCESS_KEY"];
  const secretKey = process.env["S3_SECRET_KEY"];
  if (!accessKey || !secretKey) {
    throw new Error(
      "BACKUP_S3_BUCKET is configured but S3_ACCESS_KEY / S3_SECRET_KEY are missing — the off-host copy could not be attempted.",
    );
  }

  let sdk: typeof import("@aws-sdk/client-s3");
  try {
    sdk = await import("@aws-sdk/client-s3");
  } catch (importError) {
    throw new Error(
      `The off-host copy requires the "@aws-sdk/client-s3" package, which could not be loaded (${String(
        importError,
      )}).`,
    );
  }

  const client = new sdk.S3Client({
    endpoint: process.env["S3_ENDPOINT"],
    region: process.env["S3_REGION"] ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  const prefix = process.env["BACKUP_S3_PREFIX"] ?? "backups/";
  const baseName = path.basename(dumpPath);
  const key = `${prefix}${baseName}`;
  const dumpBody = await readFile(dumpPath);
  const checksumBody = await readFile(checksumPath);

  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: dumpBody,
      ContentType: "application/octet-stream",
    }),
  );
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: `${key}.sha256`,
      Body: checksumBody,
      ContentType: "text/plain; charset=utf-8",
    }),
  );

  return {
    attempted: true,
    uploaded: true,
    bucket,
    key,
    detail: `Uploaded ${baseName} and its checksum to s3://${bucket}/${key}`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let options: BackupOptions;
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

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    error("DATABASE_URL is not set — the source database is unknown. Export it and retry.");
    process.exitCode = 1;
    return;
  }

  let target: PostgresTarget;
  try {
    target = parseDatabaseUrl(databaseUrl);
  } catch (parseError) {
    error(String(parseError instanceof Error ? parseError.message : parseError));
    process.exitCode = 1;
    return;
  }

  const directory = path.resolve(process.cwd(), options.dir);
  if (containsGitSegment(directory)) {
    error(
      `Refusing to write backups into "${directory}" — the path contains a .git directory. Choose a backup directory outside the repository metadata (for example ./backups).`,
    );
    process.exitCode = 1;
    return;
  }

  const stamp = timestampSlug();
  const labelSuffix = options.label ? `-${options.label}` : "";
  const dumpPath = path.join(directory, `zein-${stamp}${labelSuffix}.dump`);
  const checksumPath = `${dumpPath}.sha256`;

  log(
    "plan",
    `source database=${target.database} host=${target.host} port=${target.port} user=${target.user} (credentials are not logged)`,
  );
  log("plan", `backup directory=${directory}`);
  log("plan", `dump file=${dumpPath}`);
  log("plan", `retention days=${options.retentionDays}`);
  log(
    "plan",
    !options.upload
      ? "off-host upload=disabled by --no-upload"
      : options.bucket
        ? `off-host bucket=${options.bucket}`
        : "off-host upload=not configured (BACKUP_S3_BUCKET is unset — no off-host copy will be made)",
  );

  if (options.dryRun) {
    log("dry-run", "No file was created, no command was executed, nothing was deleted.");
    return;
  }

  if (!(await isCoveredByGitignore(directory))) {
    warn(
      `"${path.relative(process.cwd(), directory) || "."}" is not covered by .gitignore — add it before running backups. Dump files contain production data and must never be committed.`,
    );
  }

  let dumpTool: ToolSpec;
  let restoreTool: ToolSpec;
  try {
    dumpTool = resolveTool("dump");
    restoreTool = resolveTool("restore");
  } catch (toolError) {
    error(String(toolError instanceof Error ? toolError.message : toolError));
    process.exitCode = 1;
    return;
  }
  log("tool", `pg_dump=${dumpTool.kind === "local" ? dumpTool.binary : `docker exec ${dumpTool.container} pg_dump`}`);
  log("tool", `pg_restore=${restoreTool.kind === "local" ? restoreTool.binary : `docker exec ${restoreTool.container} pg_restore`}`);

  await mkdir(directory, { recursive: true });

  log("dump", `starting custom-format dump (pg_dump -Fc) → ${path.basename(dumpPath)}`);
  const dumpInvocation = buildDumpInvocation(dumpTool, target, dumpPath);
  const dumpResult =
    dumpTool.kind === "local"
      ? await runCommand(dumpInvocation.command, dumpInvocation.args, { env: dumpInvocation.env })
      : await runCommandToFile(dumpInvocation.command, dumpInvocation.args, dumpPath, {
          env: dumpInvocation.env,
        });

  if (dumpResult.timedOut) {
    error(`pg_dump timed out after ${timeoutMs()} ms.`);
    await rm(dumpPath, { force: true });
    process.exitCode = 1;
    return;
  }
  if (dumpResult.spawnError) {
    error(`pg_dump could not be started: ${dumpResult.spawnError}`);
    process.exitCode = 1;
    return;
  }
  if (dumpResult.code !== 0) {
    error(`pg_dump failed with exit code ${dumpResult.code}: ${dumpResult.stderr.trim() || "no output"}`);
    await rm(dumpPath, { force: true });
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dumpPath)) {
    error("pg_dump reported success but no dump file was produced.");
    process.exitCode = 1;
    return;
  }

  const dumpInfo = await stat(dumpPath);
  if (dumpInfo.size === 0) {
    error("The dump file is empty — the backup is not usable.");
    await rm(dumpPath, { force: true });
    process.exitCode = 1;
    return;
  }
  log("dump", `written bytes=${dumpInfo.size} file=${path.basename(dumpPath)}`);

  const checksum = await sha256File(dumpPath);
  await writeFile(checksumPath, `${checksum}  ${path.basename(dumpPath)}\n`, "utf8");
  log("checksum", `sha256=${checksum} sidecar=${path.basename(checksumPath)}`);

  const listing = await listArchive(restoreTool, dumpPath, target);
  if (listing.timedOut) {
    error(`pg_restore --list timed out after ${timeoutMs()} ms — the archive was not verified.`);
    process.exitCode = 1;
    return;
  }
  if (listing.spawnError) {
    error(`pg_restore could not be started: ${listing.spawnError}`);
    process.exitCode = 1;
    return;
  }
  if (listing.code !== 0) {
    error(
      `pg_restore --list failed with exit code ${listing.code}: ${listing.stderr.trim() || "no output"} — the archive is NOT usable.`,
    );
    process.exitCode = 1;
    return;
  }
  const objectCount = countArchiveObjects(listing.stdout);
  if (objectCount === 0) {
    error("pg_restore --list returned an empty archive listing — the dump is NOT usable.");
    process.exitCode = 1;
    return;
  }
  log("verify", `archive listing OK objects=${objectCount}`);

  const rotation = await rotate(directory, options.retentionDays, path.basename(dumpPath));
  log(
    "rotate",
    `deleted=${rotation.deleted.length} kept=${rotation.kept.length} newest-protected=${rotation.protectedNewest ?? "none"}`,
  );
  for (const name of rotation.deleted) {
    log("rotate", `deleted expired dump ${name}`);
  }

  let upload: UploadOutcome;
  try {
    upload = await uploadOffHost(dumpPath, checksumPath, options.upload ? options.bucket : null);
  } catch (uploadError) {
    error(
      `The local backup succeeded, but the off-host copy failed: ${
        uploadError instanceof Error ? uploadError.message : String(uploadError)
      }`,
    );
    process.exitCode = 1;
    return;
  }

  if (!upload.attempted) {
    warn(upload.detail);
    log(
      "offhost",
      "status=NOT-CONFIGURED — off-host coverage is a pre-production blocker (see docs/ops/backup-and-restore.md).",
    );
  } else if (upload.uploaded) {
    log("offhost", `status=UPLOADED bucket=${upload.bucket} key=${upload.key}`);
  } else {
    warn(upload.detail);
  }

  log(
    "result",
    `status=success file=${path.basename(dumpPath)} bytes=${dumpInfo.size} sha256=${checksum} objects=${objectCount} offhost=${
      upload.uploaded ? "uploaded" : "not-made"
    }`,
  );
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/backup-postgres.ts");
if (isDirectRun) {
  main().catch((mainError) => {
    error(mainError instanceof Error ? mainError.stack ?? mainError.message : String(mainError));
    process.exitCode = 1;
  });
}
