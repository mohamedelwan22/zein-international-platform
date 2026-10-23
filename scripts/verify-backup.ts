#!/usr/bin/env node
/**
 * Backup integrity verification — T115 (FR-046; plan.md "Backup/Recovery
 * Strategy": weekly dump-integrity check for restore readiness).
 *
 * Verifies a custom-format dump against its SHA-256 sidecar and against the
 * object listing produced by `pg_restore --list`. The script is read-only:
 * it never connects to a database and never writes to one.
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-backup.ts [dump-file] [--dir <path>] [--help]
 *
 * Exit codes: 0 = the dump is intact, non-zero = the dump failed a check.
 */

import "dotenv/config";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const SCRIPT_NAME = "verify-backup";
const DEFAULT_DIR = "./backups";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DUMP_FILE_PATTERN = /^zein-\d{8}T\d{6}Z(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?\.dump$/;

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
}

interface VerifyOptions {
  help: boolean;
  dumpPath: string | null;
  dir: string;
}

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "UNVERIFIED";
  detail: string;
}

function log(step: string, message: string): void {
  console.log(`${new Date().toISOString()} [${SCRIPT_NAME}] ${step} ${message}`);
}

function error(message: string): void {
  console.error(`${new Date().toISOString()} [${SCRIPT_NAME}] ERROR ${message}`);
}

function printHelp(): void {
  console.log(
    [
      `${SCRIPT_NAME} — verify a PostgreSQL backup archive (T115 / FR-046).`,
      "",
      "Usage:",
      "  pnpm exec tsx scripts/verify-backup.ts [dump-file] [options]",
      "",
      "Options:",
      "  --help           Show this help and exit.",
      "  --dir <path>     Directory searched for the newest dump when no file is given",
      "                   (default: $BACKUP_DIR or ./backups).",
      "",
      "Checks performed:",
      "  1. the dump file exists and is not empty,",
      "  2. the SHA-256 of the dump matches the <dump>.sha256 sidecar,",
      "  3. `pg_restore --list` succeeds and reports at least one archive entry.",
      "",
      "Environment variables (names only — values are never logged):",
      "  BACKUP_DIR                Backup directory (default ./backups).",
      "  BACKUP_COMMAND_TIMEOUT_MS Timeout for external commands in ms (default 900000).",
      "  PG_RESTORE_BIN            Explicit path to pg_restore (default: resolved from PATH).",
      "  PG_CONTAINER              Run pg_restore inside this container via `docker exec`.",
      "",
      "Exit codes: 0 = the dump is intact, non-zero = a check failed.",
    ].join("\n"),
  );
}

function parseOptions(argv: string[]): VerifyOptions {
  const options: VerifyOptions = {
    help: false,
    dumpPath: null,
    dir: process.env["BACKUP_DIR"] ?? DEFAULT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dir") {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error("Missing value for option --dir");
      }
      index += 1;
      options.dir = value;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (options.dumpPath === null) {
      options.dumpPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return options;
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

function countArchiveObjects(listing: string): number {
  return listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(";")).length;
}

async function main(): Promise<void> {
  let options: VerifyOptions;
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

  const checks: CheckResult[] = [];

  const dumpPath = options.dumpPath
    ? path.resolve(process.cwd(), options.dumpPath)
    : await newestDump(path.resolve(process.cwd(), options.dir));

  if (!dumpPath) {
    error(
      `No dump file was given and no dump was found in "${options.dir}". Pass the path to a dump file as the first argument.`,
    );
    process.exitCode = 1;
    return;
  }

  log("target", `dump=${dumpPath}`);

  if (!existsSync(dumpPath)) {
    checks.push({ name: "dump-exists", status: "FAIL", detail: "the file does not exist" });
    report(checks);
    process.exitCode = 1;
    return;
  }

  const dumpInfo = await stat(dumpPath);
  if (dumpInfo.size === 0) {
    checks.push({ name: "dump-exists", status: "FAIL", detail: "the file is empty" });
  } else {
    checks.push({
      name: "dump-exists",
      status: "PASS",
      detail: `file present, bytes=${dumpInfo.size}`,
    });
  }

  const checksumPath = `${dumpPath}.sha256`;
  if (!existsSync(checksumPath)) {
    checks.push({
      name: "sha256-sidecar",
      status: "FAIL",
      detail: `the sidecar file ${path.basename(checksumPath)} is missing — the dump cannot be trusted`,
    });
  } else {
    const sidecar = await readFile(checksumPath, "utf8");
    const expected = sidecar.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!/^[0-9a-f]{64}$/.test(expected)) {
      checks.push({
        name: "sha256-sidecar",
        status: "FAIL",
        detail: `the sidecar does not contain a valid SHA-256 digest`,
      });
    } else {
      const actual = await sha256File(dumpPath);
      if (actual !== expected) {
        checks.push({
          name: "sha256-sidecar",
          status: "FAIL",
          detail: `checksum mismatch expected=${expected} actual=${actual}`,
        });
      } else {
        checks.push({
          name: "sha256-sidecar",
          status: "PASS",
          detail: `sha256=${actual} matches ${path.basename(checksumPath)}`,
        });
      }
    }
  }

  const container = process.env["PG_CONTAINER"] ?? "";
  let restoreBinary: string | null = null;
  let restoreArgs: string[] = [];
  const restoreEnv: NodeJS.ProcessEnv = { ...process.env };

  if (container) {
    restoreBinary = findExecutable("docker");
    if (!restoreBinary) {
      checks.push({
        name: "archive-listing",
        status: "UNVERIFIED",
        detail:
          "PG_CONTAINER is set but the `docker` executable was not found on PATH — the archive listing could not be produced",
      });
      report(checks);
      process.exitCode = 1;
      return;
    }
    restoreArgs = ["exec", "-i", container, "pg_restore", "--list"];
  } else {
    restoreBinary = findExecutable("pg_restore", process.env["PG_RESTORE_BIN"]);
    if (!restoreBinary) {
      checks.push({
        name: "archive-listing",
        status: "UNVERIFIED",
        detail:
          "pg_restore was not found — install the PostgreSQL client tools or set PG_RESTORE_BIN / PG_CONTAINER",
      });
      report(checks);
      process.exitCode = 1;
      return;
    }
    restoreArgs = ["--list", dumpPath];
  }

  const listing = container
    ? await runCommand(restoreBinary, restoreArgs, { env: restoreEnv, inputFile: dumpPath })
    : await runCommand(restoreBinary, restoreArgs, { env: restoreEnv });

  if (listing.timedOut) {
    checks.push({
      name: "archive-listing",
      status: "UNVERIFIED",
      detail: `pg_restore --list timed out after ${timeoutMs()} ms`,
    });
  } else if (listing.spawnError) {
    checks.push({
      name: "archive-listing",
      status: "UNVERIFIED",
      detail: `pg_restore could not be started: ${listing.spawnError}`,
    });
  } else if (listing.code !== 0) {
    checks.push({
      name: "archive-listing",
      status: "FAIL",
      detail: `pg_restore --list failed with exit code ${listing.code}: ${
        listing.stderr.trim() || "no output"
      }`,
    });
  } else {
    const objects = countArchiveObjects(listing.stdout);
    if (objects === 0) {
      checks.push({
        name: "archive-listing",
        status: "FAIL",
        detail: "pg_restore --list returned an empty archive — the dump contains no objects",
      });
    } else {
      checks.push({
        name: "archive-listing",
        status: "PASS",
        detail: `pg_restore --list reported ${objects} archive entries`,
      });
    }
  }

  report(checks);
  const failed = checks.some((check) => check.status !== "PASS");
  if (failed) {
    process.exitCode = 1;
  }
}

function report(checks: CheckResult[]): void {
  for (const check of checks) {
    log(check.status.padEnd(10), `${check.name} — ${check.detail}`);
  }
  const failed = checks.some((check) => check.status === "FAIL");
  const unverified = checks.some((check) => check.status === "UNVERIFIED");
  const verdict = failed ? "FAIL" : unverified ? "INCOMPLETE" : "PASS";
  log("result", `verdict=${verdict} checks=${checks.length}`);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/verify-backup.ts");
if (isDirectRun) {
  main().catch((mainError) => {
    error(mainError instanceof Error ? mainError.stack ?? mainError.message : String(mainError));
    process.exitCode = 1;
  });
}
