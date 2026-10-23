#!/usr/bin/env node
/**
 * Isolated restore drill — T115/T116 helper (SC-015, FR-046).
 *
 * Restores a backup archive into an ISOLATED database (never the source, never
 * the default development database), spot-checks the restored data with
 * read-only queries, and writes dated evidence to
 * `docs/ops/restore-drills/YYYY-MM-DD-<stamp>.md`.
 *
 * Safety rules enforced by this script:
 *   - an explicit `--target-database-url` is mandatory;
 *   - the target database name must differ from the source database name;
 *   - the target database must not be the default development database
 *     (`zein`) nor a PostgreSQL system database;
 *   - the target database must be empty (no user tables) before the restore;
 *   - `pg_restore` is NEVER invoked with `--clean`;
 *   - the archive is checksum-verified BEFORE anything is restored.
 *
 * Usage:
 *   pnpm exec tsx scripts/restore-drill.ts --target-database-url <url>
 *       [--dump <path>] [--dir <path>] [--report-dir <path>] [--dry-run]
 *
 * Exit codes: 0 = the drill PASSED, non-zero = FAIL / INCOMPLETE / ABORT.
 */

import "dotenv/config";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const SCRIPT_NAME = "restore-drill";
const DEFAULT_DIR = "./backups";
const DEFAULT_REPORT_DIR = "docs/ops/restore-drills";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DUMP_FILE_PATTERN = /^zein-\d{8}T\d{6}Z(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?\.dump$/;
/** Database names that must never be used as a restore target. */
const FORBIDDEN_TARGET_DATABASES = new Set(["zein", "postgres", "template0", "template1"]);
const COUNTED_TABLES = [
  "Brand",
  "Product",
  "CmsSection",
  "Media",
  "Inquiry",
  "PartnershipRequest",
  "SlugRedirect",
  "ActivityLog",
] as const;

type StepStatus = "PASS" | "FAIL" | "UNVERIFIED";

interface StepResult {
  name: string;
  status: StepStatus;
  detail: string;
}

interface PostgresTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface DrillOptions {
  help: boolean;
  dryRun: boolean;
  targetDatabaseUrl: string | null;
  dumpPath: string | null;
  dir: string;
  reportDir: string;
}

interface Observation {
  label: string;
  target: string;
  source: string;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
}

function log(step: string, message: string): void {
  console.log(`${new Date().toISOString()} [${SCRIPT_NAME}] ${step} ${message}`);
}

function error(message: string): void {
  console.error(`${new Date().toISOString()} [${SCRIPT_NAME}] ERROR ${message}`);
}

function abort(message: string): void {
  console.error(`${new Date().toISOString()} [${SCRIPT_NAME}] ABORT ${message}`);
}

function printHelp(): void {
  console.log(
    [
      `${SCRIPT_NAME} — isolated restore drill with recorded evidence (T116 / SC-015).`,
      "",
      "Usage:",
      "  pnpm exec tsx scripts/restore-drill.ts --target-database-url <url> [options]",
      "",
      "Required:",
      "  --target-database-url <url>   Connection URL of the ISOLATED restore target.",
      "                                It must name a different database than DATABASE_URL and",
      "                                must not be the development database (zein).",
      "",
      "Options:",
      "  --help                  Show this help and exit.",
      "  --dry-run               Print the plan and the isolation checks; nothing is restored.",
      "  --dump <path>           Backup archive to restore (default: newest dump in --dir).",
      "  --dir <path>            Directory searched for the newest dump (default: $BACKUP_DIR or ./backups).",
      "  --report-dir <path>     Where the evidence report is written",
      "                          (default: docs/ops/restore-drills).",
      "",
      "Steps:",
      "  1. preflight  — source reachable, target reachable, target isolated and empty, dump present",
      "  2. verify    — SHA-256 sidecar + `pg_restore --list` object count (before any restore)",
      "  3. restore   — `pg_restore` into the isolated target (never `--clean`, never the source)",
      "  4. spot-check— read-only row counts and published-content checks on the restored database",
      "  5. evidence  — dated report written to docs/ops/restore-drills/",
      "",
      "Environment variables (names only — values are never logged):",
      "  DATABASE_URL              Source database (required).",
      "  BACKUP_DIR                Backup directory (default ./backups).",
      "  BACKUP_COMMAND_TIMEOUT_MS Timeout for external commands in ms (default 900000).",
      "  PG_RESTORE_BIN            Explicit path to pg_restore (default: resolved from PATH).",
      "  PG_CONTAINER              Run pg_restore inside this container via `docker exec`.",
      "  PG_CONTAINER_HOST         Database host as seen from inside that container (default localhost).",
      "  PG_CONTAINER_PORT         Database port as seen from inside that container (default 5432).",
      "",
      "Exit codes: 0 = PASS, non-zero = ABORT / FAIL / INCOMPLETE.",
    ].join("\n"),
  );
}

function parseOptions(argv: string[]): DrillOptions {
  const options: DrillOptions = {
    help: false,
    dryRun: false,
    targetDatabaseUrl: null,
    dumpPath: null,
    dir: process.env["BACKUP_DIR"] ?? DEFAULT_DIR,
    reportDir: DEFAULT_REPORT_DIR,
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
      case "--target-database-url":
        options.targetDatabaseUrl = next();
        break;
      case "--dump":
        options.dumpPath = next();
        break;
      case "--dir":
        options.dir = next();
        break;
      case "--report-dir":
        options.reportDir = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseDatabaseUrl(raw: string): PostgresTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("the connection URL is not a valid URL");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error("the connection URL does not name a database");
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

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function newestDump(directory: string): Promise<string | null> {
  if (!existsSync(directory)) {
    return null;
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries.filter((entry) => entry.isFile() && DUMP_FILE_PATTERN.test(entry.name));
  let newest: { name: string; mtimeMs: number } | null = null;
  for (const candidate of candidates) {
    const info = await stat(path.join(directory, candidate.name));
    if (!newest || info.mtimeMs > newest.mtimeMs) {
      newest = { name: candidate.name, mtimeMs: info.mtimeMs };
    }
  }
  return newest ? path.join(directory, newest.name) : null;
}

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

async function connect(target: PostgresTarget): Promise<Client> {
  const client = new Client({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  return client;
}

async function countUserTables(client: Client): Promise<number> {
  const result = await client.query<{ count: number }>(
    "SELECT count(*)::int AS \"count\" FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  return result.rows[0]?.count ?? 0;
}

async function countRows(client: Client, table: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    `SELECT count(*)::int AS "count" FROM "${table}"`,
  );
  return result.rows[0]?.count ?? 0;
}

async function publishedPerLocale(client: Client): Promise<string> {
  const result = await client.query<{ locale: string; count: number }>(
    'SELECT "locale", count(*)::int AS "count" FROM "CmsSection" WHERE "publishedContent" IS NOT NULL GROUP BY "locale" ORDER BY "locale"',
  );
  if (result.rows.length === 0) {
    return "none";
  }
  return result.rows.map((row) => `${row.locale}=${row.count}`).join(", ");
}

async function sampleMediaKey(client: Client): Promise<string | null> {
  const result = await client.query<{ storageKey: string }>(
    'SELECT "storageKey" FROM "Media" WHERE "storageKey" IS NOT NULL AND "storageKey" <> \'\' ORDER BY "createdAt" DESC LIMIT 1',
  );
  return result.rows[0]?.storageKey ?? null;
}

function truncate(value: string, max = 48): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function verdictOf(steps: StepResult[]): "PASS" | "FAIL" | "INCOMPLETE" {
  if (steps.some((step) => step.status === "FAIL")) {
    return "FAIL";
  }
  if (steps.some((step) => step.status === "UNVERIFIED")) {
    return "INCOMPLETE";
  }
  return "PASS";
}

function statusIcon(status: StepStatus): string {
  if (status === "PASS") {
    return "PASS";
  }
  if (status === "FAIL") {
    return "FAIL";
  }
  return "UNVERIFIED";
}

async function main(): Promise<void> {
  let options: DrillOptions;
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

  const sourceUrl = process.env["DATABASE_URL"];
  if (!sourceUrl) {
    abort("DATABASE_URL is not set — the source database is unknown. Export it and retry.");
    process.exitCode = 1;
    return;
  }

  let source: PostgresTarget;
  try {
    source = parseDatabaseUrl(sourceUrl);
  } catch (parseError) {
    abort(`DATABASE_URL is invalid: ${String(parseError instanceof Error ? parseError.message : parseError)}`);
    process.exitCode = 1;
    return;
  }

  if (!options.targetDatabaseUrl) {
    abort(
      "No --target-database-url was given. The restore drill restores into an isolated database only; the source database is never a valid target. Create an empty drill database first, for example: CREATE DATABASE zein_restore_drill;",
    );
    process.exitCode = 1;
    return;
  }

  let target: PostgresTarget;
  try {
    target = parseDatabaseUrl(options.targetDatabaseUrl);
  } catch (parseError) {
    abort(
      `--target-database-url is invalid: ${String(parseError instanceof Error ? parseError.message : parseError)}`,
    );
    process.exitCode = 1;
    return;
  }

  // --- Isolation safeguards (evaluated before anything else happens) --------
  log(
    "isolation",
    `source database=${source.database} host=${source.host} port=${source.port} user=${source.user}`,
  );
  log(
    "isolation",
    `target database=${target.database} host=${target.host} port=${target.port} user=${target.user}`,
  );

  if (target.database === source.database) {
    abort(
      `The target database "${target.database}" is the SAME database as the source "${source.database}". The drill refuses to restore onto the source. Point --target-database-url at an empty drill database.`,
    );
    process.exitCode = 1;
    return;
  }

  if (FORBIDDEN_TARGET_DATABASES.has(target.database.toLowerCase())) {
    abort(
      `The target database "${target.database}" is a protected name (${[...FORBIDDEN_TARGET_DATABASES].join(", ")}). The drill refuses to restore into the development database or a PostgreSQL system database.`,
    );
    process.exitCode = 1;
    return;
  }

  log("isolation", "check=different-database PASS");
  log("isolation", "check=not-a-protected-name PASS");

  const dumpPath = options.dumpPath
    ? path.resolve(process.cwd(), options.dumpPath)
    : await newestDump(path.resolve(process.cwd(), options.dir));

  log("plan", `dump=${dumpPath ?? "none found"}`);
  log("plan", `restore command=pg_restore --no-owner --no-privileges (never --clean)`);
  log("plan", `report directory=${path.resolve(process.cwd(), options.reportDir)}`);

  if (options.dryRun) {
    log("dry-run", "No connection was opened, nothing was restored, no report was written.");
    return;
  }

  const clients: Client[] = [];
  try {
    const verdict = await runDrill(options, source, target, dumpPath, clients);
    if (verdict !== "PASS") {
      process.exitCode = 1;
    }
  } finally {
    for (const client of clients) {
      await client.end().catch(() => undefined);
    }
  }
}

type Verdict = "PASS" | "FAIL" | "INCOMPLETE";

async function runDrill(
  options: DrillOptions,
  source: PostgresTarget,
  target: PostgresTarget,
  dumpPath: string | null,
  clients: Client[],
): Promise<Verdict> {
  const steps: StepResult[] = [];
  const observations: Observation[] = [];
  const findings: string[] = [];

  // --- Step 1: preflight ---------------------------------------------------
  let sourceClient: Client | null = null;
  let targetClient: Client | null = null;

  try {
    sourceClient = await connect(source);
    clients.push(sourceClient);
    await sourceClient.query("SELECT 1");
    steps.push({
      name: "preflight/source-reachable",
      status: "PASS",
      detail: `source database "${source.database}" answered SELECT 1`,
    });
  } catch (connectFailure) {
    steps.push({
      name: "preflight/source-reachable",
      status: "UNVERIFIED",
      detail: `the source database could not be reached: ${
        connectFailure instanceof Error ? connectFailure.message : String(connectFailure)
      }`,
    });
  }

  try {
    targetClient = await connect(target);
    clients.push(targetClient);
    await targetClient.query("SELECT 1");
    steps.push({
      name: "preflight/target-reachable",
      status: "PASS",
      detail: `target database "${target.database}" answered SELECT 1`,
    });
  } catch (connectFailure) {
    steps.push({
      name: "preflight/target-reachable",
      status: "UNVERIFIED",
      detail: `the target database could not be reached: ${
        connectFailure instanceof Error ? connectFailure.message : String(connectFailure)
      }`,
    });
  }

  if (targetClient) {
    try {
      const tables = await countUserTables(targetClient);
      if (tables === 0) {
        steps.push({
          name: "preflight/target-isolated",
          status: "PASS",
          detail: `target database "${target.database}" contains no user tables`,
        });
      } else {
        steps.push({
          name: "preflight/target-isolated",
          status: "FAIL",
          detail: `target database "${target.database}" already contains ${tables} table(s) — the drill refuses to restore over existing data. Drop and recreate the drill database first.`,
        });
      }
    } catch (tableFailure) {
      steps.push({
        name: "preflight/target-isolated",
        status: "UNVERIFIED",
        detail: `the target table inventory could not be read: ${
          tableFailure instanceof Error ? tableFailure.message : String(tableFailure)
        }`,
      });
    }
  } else {
    steps.push({
      name: "preflight/target-isolated",
      status: "UNVERIFIED",
      detail: "the target database was unreachable — isolation could not be confirmed",
    });
  }

  if (dumpPath && existsSync(dumpPath)) {
    const dumpInfo = await stat(dumpPath);
    steps.push({
      name: "preflight/dump-present",
      status: dumpInfo.size > 0 ? "PASS" : "FAIL",
      detail: `archive=${path.basename(dumpPath)} bytes=${dumpInfo.size}`,
    });
  } else {
    steps.push({
      name: "preflight/dump-present",
      status: "FAIL",
      detail: `no usable dump was found (looked in "${options.dir}") — run scripts/backup-postgres.ts first`,
    });
  }

  for (const step of steps) {
    log(statusIcon(step.status), `${step.name} — ${step.detail}`);
  }

  const blockingFailure = steps.some(
    (step) => step.status === "FAIL" && step.name.startsWith("preflight/"),
  );
  if (blockingFailure) {
    findings.push(
      "The preflight failed, so no restore was attempted. The drill is not a PASS and the drill database was left untouched.",
    );
    await finish(options, steps, observations, findings, source, target, null, null, 0);
    return verdictOf(steps);
  }

  if (!dumpPath) {
    findings.push("No archive was available, so the drill could not continue.");
    await finish(options, steps, observations, findings, source, target, null, null, 0);
    return verdictOf(steps);
  }

  // --- Step 2: verify the archive before restoring --------------------------
  const container = process.env["PG_CONTAINER"] ?? "";
  let restoreBinary: string | null = null;
  let restoreArgs: string[] = [];
  let restoreEnv: NodeJS.ProcessEnv = { ...process.env };

  if (container) {
    restoreBinary = findExecutable("docker");
    if (!restoreBinary) {
      steps.push({
        name: "verify/archive-listing",
        status: "UNVERIFIED",
        detail:
          "PG_CONTAINER is set but the `docker` executable was not found on PATH — the archive could not be listed",
      });
    }
  } else {
    restoreBinary = findExecutable("pg_restore", process.env["PG_RESTORE_BIN"]);
    if (!restoreBinary) {
      steps.push({
        name: "verify/archive-listing",
        status: "UNVERIFIED",
        detail:
          "pg_restore was not found — install the PostgreSQL client tools or set PG_RESTORE_BIN / PG_CONTAINER",
      });
    }
  }

  let archiveObjects = 0;
  let dumpChecksum: string | null = null;

  if (dumpPath && existsSync(dumpPath)) {
    const checksumPath = `${dumpPath}.sha256`;
    if (!existsSync(checksumPath)) {
      steps.push({
        name: "verify/checksum",
        status: "FAIL",
        detail: `the sidecar ${path.basename(checksumPath)} is missing — the archive cannot be trusted`,
      });
    } else {
      const sidecar = await readFile(checksumPath, "utf8");
      const expected = sidecar.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const actual = await sha256File(dumpPath);
      dumpChecksum = actual;
      if (!/^[0-9a-f]{64}$/.test(expected)) {
        steps.push({
          name: "verify/checksum",
          status: "FAIL",
          detail: "the sidecar does not contain a valid SHA-256 digest",
        });
      } else if (actual !== expected) {
        steps.push({
          name: "verify/checksum",
          status: "FAIL",
          detail: `checksum mismatch expected=${expected} actual=${actual}`,
        });
      } else {
        steps.push({
          name: "verify/checksum",
          status: "PASS",
          detail: `sha256=${actual} matches ${path.basename(checksumPath)}`,
        });
      }
    }
  }

  if (restoreBinary) {
    const host = container ? (process.env["PG_CONTAINER_HOST"] ?? "localhost") : target.host;
    const port = container
      ? Number.parseInt(process.env["PG_CONTAINER_PORT"] ?? "5432", 10)
      : target.port;

    if (container) {
      restoreArgs = [
        "exec",
        "-i",
        "-e",
        `PGPASSWORD=${target.password}`,
        container,
        "pg_restore",
        "-h",
        host,
        "-p",
        String(port),
        "-U",
        target.user,
        "-d",
        target.database,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "-",
      ];
    } else {
      restoreEnv = { ...process.env, PGPASSWORD: target.password };
      restoreArgs = [
        "-h",
        host,
        "-p",
        String(port),
        "-U",
        target.user,
        "-d",
        target.database,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        dumpPath,
      ];
    }

    const listing = container
      ? await runCommand(restoreBinary, ["exec", "-i", container, "pg_restore", "--list"], {
          inputFile: dumpPath,
        })
      : await runCommand(restoreBinary, ["--list", dumpPath], { env: restoreEnv });

    if (listing.timedOut) {
      steps.push({
        name: "verify/archive-listing",
        status: "UNVERIFIED",
        detail: `pg_restore --list timed out after ${timeoutMs()} ms`,
      });
    } else if (listing.spawnError) {
      steps.push({
        name: "verify/archive-listing",
        status: "UNVERIFIED",
        detail: `pg_restore could not be started: ${listing.spawnError}`,
      });
    } else if (listing.code !== 0) {
      steps.push({
        name: "verify/archive-listing",
        status: "FAIL",
        detail: `pg_restore --list failed with exit code ${listing.code}: ${
          listing.stderr.trim() || "no output"
        }`,
      });
    } else {
      archiveObjects = listing.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith(";")).length;
      if (archiveObjects === 0) {
        steps.push({
          name: "verify/archive-listing",
          status: "FAIL",
          detail: "pg_restore --list returned an empty archive — the dump contains no objects",
        });
      } else {
        steps.push({
          name: "verify/archive-listing",
          status: "PASS",
          detail: `pg_restore --list reported ${archiveObjects} archive entries`,
        });
      }
    }
  }

  for (const step of steps.filter((entry) => entry.name.startsWith("verify/"))) {
    log(statusIcon(step.status), `${step.name} — ${step.detail}`);
  }

  const verifyFailure = steps.some(
    (step) => step.status === "FAIL" && step.name.startsWith("verify/"),
  );
  if (verifyFailure) {
    findings.push(
      "The archive failed verification, so no restore was attempted (the drill never restores an unverified archive).",
    );
    await finish(options, steps, observations, findings, source, target, dumpPath, dumpChecksum, archiveObjects);
    return verdictOf(steps);
  }

  // --- Step 3: restore into the isolated target ----------------------------
  if (!restoreBinary || !dumpPath) {
    steps.push({
      name: "restore/execute",
      status: "UNVERIFIED",
      detail: "the restore tool or the archive was unavailable — nothing was restored",
    });
  } else {
    const restoreResult = container
      ? await runCommand(restoreBinary, restoreArgs, { env: restoreEnv, inputFile: dumpPath })
      : await runCommand(restoreBinary, restoreArgs, { env: restoreEnv });

    if (restoreResult.timedOut) {
      steps.push({
        name: "restore/execute",
        status: "UNVERIFIED",
        detail: `pg_restore timed out after ${timeoutMs()} ms`,
      });
    } else if (restoreResult.spawnError) {
      steps.push({
        name: "restore/execute",
        status: "UNVERIFIED",
        detail: `pg_restore could not be started: ${restoreResult.spawnError}`,
      });
    } else if (restoreResult.code !== 0) {
      steps.push({
        name: "restore/execute",
        status: "FAIL",
        detail: `pg_restore failed with exit code ${restoreResult.code}: ${
          restoreResult.stderr.trim() || "no output"
        }`,
      });
      findings.push(
        "The restore failed. The drill database holds a partial restore and must be dropped and recreated before the next run.",
      );
    } else {
      steps.push({
        name: "restore/execute",
        status: "PASS",
        detail: `pg_restore completed into "${target.database}" without --clean`,
      });
    }
  }

  for (const step of steps.filter((entry) => entry.name.startsWith("restore/"))) {
    log(statusIcon(step.status), `${step.name} — ${step.detail}`);
  }

  // --- Step 4: read-only spot checks on the restored database ---------------
  if (targetClient) {
    for (const table of COUNTED_TABLES) {
      let targetValue = "unavailable";
      let sourceValue = "unavailable";
      try {
        targetValue = String(await countRows(targetClient, table));
      } catch (queryFailure) {
        targetValue = `error: ${queryFailure instanceof Error ? queryFailure.message : String(queryFailure)}`;
      }
      if (sourceClient) {
        try {
          sourceValue = String(await countRows(sourceClient, table));
        } catch {
          sourceValue = "unavailable";
        }
      }
      observations.push({ label: `rows in ${table}`, target: targetValue, source: sourceValue });
      steps.push({
        name: `spot-check/${table}`,
        status: targetValue.startsWith("error") ? "FAIL" : "PASS",
        detail: `target=${targetValue} source=${sourceValue}`,
      });
    }

    try {
      const targetPublished = await publishedPerLocale(targetClient);
      let sourcePublished = "unavailable";
      if (sourceClient) {
        try {
          sourcePublished = await publishedPerLocale(sourceClient);
        } catch {
          sourcePublished = "unavailable";
        }
      }
      observations.push({
        label: "CmsSection publishedContent (per locale)",
        target: targetPublished,
        source: sourcePublished,
      });
      steps.push({
        name: "spot-check/published-content-per-locale",
        status: "PASS",
        detail: `target=${targetPublished} source=${sourcePublished}`,
      });
    } catch (publishedFailure) {
      steps.push({
        name: "spot-check/published-content-per-locale",
        status: "FAIL",
        detail: `the published-content query failed: ${
          publishedFailure instanceof Error ? publishedFailure.message : String(publishedFailure)
        }`,
      });
    }

    try {
      const mediaKey = await sampleMediaKey(targetClient);
      observations.push({
        label: "Media row with an S3 storage key",
        target: mediaKey === null ? "none" : truncate(mediaKey),
        source: "n/a",
      });
      steps.push({
        name: "spot-check/media-s3-key",
        status: "PASS",
        detail: mediaKey === null ? "no media row with a storage key" : `storage key present (${truncate(mediaKey)})`,
      });
    } catch (mediaFailure) {
      steps.push({
        name: "spot-check/media-s3-key",
        status: "FAIL",
        detail: `the media query failed: ${
          mediaFailure instanceof Error ? mediaFailure.message : String(mediaFailure)
        }`,
      });
    }
  } else {
    steps.push({
      name: "spot-check/all",
      status: "UNVERIFIED",
      detail: "the restored database was not reachable — no spot-check could be executed",
    });
  }

  for (const step of steps.filter((entry) => entry.name.startsWith("spot-check/"))) {
    log(statusIcon(step.status), `${step.name} — ${step.detail}`);
  }

  await finish(options, steps, observations, findings, source, target, dumpPath, dumpChecksum, archiveObjects);

  return verdictOf(steps);
}

/**
 * Writes the dated evidence report and prints the final verdict.
 */
async function finish(
  options: DrillOptions,
  steps: StepResult[],
  observations: Observation[],
  findings: string[],
  source: PostgresTarget,
  target: PostgresTarget,
  dumpPath: string | null,
  dumpChecksum: string | null,
  archiveObjects: number,
): Promise<void> {
  const verdict = verdictOf(steps);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const day = now.toISOString().slice(0, 10);
  const reportDirectory = path.resolve(process.cwd(), options.reportDir);
  const reportPath = path.join(reportDirectory, `${day}-${stamp}.md`);

  const verdictLine =
    verdict === "PASS"
      ? "**PASS** — every step of the drill completed successfully."
      : verdict === "FAIL"
        ? "**FAIL** — at least one step of the drill failed; the drill is not a PASS."
        : "**INCOMPLETE** — at least one step could not be executed; the drill is not a PASS.";

  const lines: string[] = [
    `# Restore drill evidence — ${day}`,
    "",
    `- Executed (UTC): ${now.toISOString()}`,
    `- Verdict: ${verdictLine}`,
    `- Operator: ${process.env["USER"] ?? process.env["USERNAME"] ?? "unknown"}`,
    "",
    "## Isolation parameters",
    "",
    "No passwords, tokens or secrets are recorded in this report.",
    "",
    "| Parameter | Value |",
    "|---|---|",
    `| Source database | \`${source.database}\` |`,
    `| Source server | \`${source.host}:${source.port}\` |`,
    `| Source role | \`${source.user}\` |`,
    `| Target database | \`${target.database}\` |`,
    `| Target server | \`${target.host}:${target.port}\` |`,
    `| Target role | \`${target.user}\` |`,
    `| Restore command | \`pg_restore --no-owner --no-privileges --exit-on-error\` (never \`--clean\`) |`,
    "",
    "## Backup artifact",
    "",
    "| Parameter | Value |",
    "|---|---|",
    `| Archive | \`${dumpPath ?? "none"}\` |`,
    `| SHA-256 | \`${dumpChecksum ?? "not computed"}\` |`,
    `| pg_restore --list entries | ${archiveObjects} |`,
    "",
    "## Steps",
    "",
    "| Step | Result | Observed |",
    "|---|---|---|",
    ...steps.map(
      (step) => `| \`${step.name}\` | ${statusIcon(step.status)} | ${step.detail.replace(/\|/g, "\\|")} |`,
    ),
    "",
    "## Spot-check observations",
    "",
    "| Observation | Restored database | Source database |",
    "|---|---|---|",
    ...observations.map(
      (observation) =>
        `| ${observation.label} | ${observation.target} | ${observation.source} |`,
    ),
    "",
    "## Findings",
    "",
    ...(findings.length > 0 ? findings.map((finding) => `- ${finding}`) : ["- No findings were recorded."]),
    "",
    "## Verdict",
    "",
    verdictLine,
    "",
    "The drill restores into an isolated database only. The source database is never",
    "written to and `pg_restore --clean` is never used.",
    "",
    "## Reproduction",
    "",
    "```text",
    "pnpm exec tsx scripts/restore-drill.ts --target-database-url <isolated-database-url>",
    "```",
    "",
  ];

  try {
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(reportPath, lines.join("\n"), "utf8");
    log("report", `written=${reportPath}`);
  } catch (reportFailure) {
    error(
      `The evidence report could not be written to ${reportPath}: ${
        reportFailure instanceof Error ? reportFailure.message : String(reportFailure)
      }`,
    );
    process.exitCode = 1;
  }

  log(
    "result",
    `verdict=${verdict} steps=${steps.length} failures=${steps.filter((step) => step.status === "FAIL").length} unverified=${
      steps.filter((step) => step.status === "UNVERIFIED").length
    }`,
  );
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/restore-drill.ts");
if (isDirectRun) {
  main().catch((mainError) => {
    error(mainError instanceof Error ? mainError.stack ?? mainError.message : String(mainError));
    process.exitCode = 1;
  });
}
