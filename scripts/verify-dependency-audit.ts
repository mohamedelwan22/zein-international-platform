/**
 * Dependency audit gate (T110/T118).
 *
 * `pnpm audit --ignore <id>` is NOT a narrow exception in pnpm 11.2.2: a run
 * with a bogus advisory ID still exits 0 while a real advisory is present, and
 * the supplied value is persisted into `pnpm-workspace.yaml`
 * (`auditConfig.ignoreGhsas`). Both behaviours make the CLI flag unusable as a
 * release gate, so this script evaluates the UNFILTERED `pnpm audit --json`
 * report itself.
 *
 * Exactly one advisory is allow-listed, and only while it stays dev-only and on
 * the reviewed dependency path. Any new advisory, or any drift in the
 * exception's module/range/path, fails the gate.
 *
 * Because the advisory metadata already advertises a patched range that is not
 * published on npm (`braces <=3.0.3`, patched `>=3.0.4`), the release gate also
 * probes the configured npm registry for a published version satisfying that
 * range. An unreachable registry is INDETERMINATE (exit 3), never "clean".
 *
 * Usage:
 *   pnpm verify:deps                 # release gate (audit + registry probe)
 *   pnpm verify:deps --report f.json # offline evaluation of a captured report
 *                                    # (registry state is NOT checked, not a gate)
 *
 * Exit codes: 0 = clean audit or allowed temporary exception, 1 = violation,
 * 2 = invalid/unexpected report, 3 = registry state indeterminate.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AuditFinding {
  version: string;
  paths: string[];
  dev: boolean;
  optional: boolean;
  bundled: boolean;
}

export interface AuditAdvisory {
  id: number | string;
  title: string;
  module_name: string;
  vulnerable_versions: string;
  patched_versions: string;
  severity: string;
  github_advisory_id?: string;
  findings: AuditFinding[];
}

export interface AuditReport {
  advisories: Record<string, AuditAdvisory>;
  metadata: {
    vulnerabilities: Record<Severity, number>;
    totalDependencies?: number;
  };
}

export const ALLOWED_ADVISORY = {
  githubAdvisoryId: "GHSA-vfj7-8cjw-p6xm",
  moduleName: "braces",
  vulnerableVersions: "<=3.0.3",
  patchedVersions: ">=3.0.4",
  dependencyPath: ".>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces",
  rationale:
    "dev-only lint toolchain (eslint-config-next); the patched release is not published on npm — see docs/ops/dependency-audit.md",
} as const;

const SEVERITIES = ["info", "low", "moderate", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
const SEVERITY_SET = new Set<string>(SEVERITIES);

export const DEFAULT_REGISTRY_TIMEOUT_MS = 10_000;

export const EXIT_CODE = {
  OK: 0,
  VIOLATION: 1,
  INVALID_REPORT: 2,
  INDETERMINATE: 3,
} as const;

export class AuditReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditReportError";
  }
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AuditReportError(`${context}: "${key}" must be a non-empty string (got ${describeValue(value)})`);
  }
  return value;
}

function parseFinding(input: unknown, context: string): AuditFinding {
  if (!isRecord(input)) throw new AuditReportError(`${context}: finding must be an object (got ${describeValue(input)})`);
  const version = requireString(input, "version", context);
  if (typeof input.dev !== "boolean") {
    throw new AuditReportError(`${context}: "dev" must be a boolean (got ${describeValue(input.dev)})`);
  }
  if (!Array.isArray(input.paths) || input.paths.length === 0) {
    throw new AuditReportError(`${context}: "paths" must be a non-empty array (got ${describeValue(input.paths)})`);
  }
  const paths = input.paths.map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new AuditReportError(`${context}: paths[${index}] must be a non-empty string (got ${describeValue(entry)})`);
    }
    return entry;
  });
  return {
    version,
    paths,
    dev: input.dev,
    optional: input.optional === true,
    bundled: input.bundled === true,
  };
}

function parseAdvisory(key: string, input: unknown): AuditAdvisory {
  const context = `advisories["${key}"]`;
  if (!isRecord(input)) throw new AuditReportError(`${context}: advisory must be an object (got ${describeValue(input)})`);
  const severity = requireString(input, "severity", context);
  if (!SEVERITY_SET.has(severity)) {
    throw new AuditReportError(`${context}: unknown severity "${severity}"`);
  }
  const rawGithubAdvisoryId = input.github_advisory_id;
  let githubAdvisoryId: string | undefined;
  if (rawGithubAdvisoryId !== undefined) {
    if (typeof rawGithubAdvisoryId !== "string" || rawGithubAdvisoryId.length === 0) {
      throw new AuditReportError(`${context}: "github_advisory_id" must be a non-empty string when present`);
    }
    githubAdvisoryId = rawGithubAdvisoryId;
  }
  if (!Array.isArray(input.findings) || input.findings.length === 0) {
    throw new AuditReportError(`${context}: "findings" must be a non-empty array (got ${describeValue(input.findings)})`);
  }
  return {
    id: typeof input.id === "number" || typeof input.id === "string" ? input.id : key,
    title: requireString(input, "title", context),
    module_name: requireString(input, "module_name", context),
    vulnerable_versions: requireString(input, "vulnerable_versions", context),
    patched_versions: requireString(input, "patched_versions", context),
    severity,
    ...(githubAdvisoryId === undefined ? {} : { github_advisory_id: githubAdvisoryId }),
    findings: input.findings.map((finding, index) => parseFinding(finding, `${context}.findings[${index}]`)),
  };
}

/**
 * Strict structural validation. Anything that is not a complete pnpm/npm audit
 * report (registry errors, truncated output, `{}`, `{"advisories":null}`, …)
 * is rejected instead of being interpreted as "no advisories".
 */
export function parseAuditReport(input: unknown): AuditReport {
  if (!isRecord(input)) {
    throw new AuditReportError(`audit report must be a JSON object (got ${describeValue(input)})`);
  }
  if (!isRecord(input.advisories)) {
    throw new AuditReportError(
      `audit report is missing an "advisories" object (got ${describeValue(input.advisories)}) — registry or command failure?`,
    );
  }
  if (!isRecord(input.metadata)) {
    throw new AuditReportError(`audit report is missing a "metadata" object (got ${describeValue(input.metadata)})`);
  }
  const declared = input.metadata.vulnerabilities;
  if (!isRecord(declared)) {
    throw new AuditReportError(
      `audit report is missing "metadata.vulnerabilities" (got ${describeValue(declared)}) — unexpected report shape`,
    );
  }
  for (const severity of SEVERITIES) {
    const count = declared[severity];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new AuditReportError(`metadata.vulnerabilities.${severity} must be a non-negative integer (got ${describeValue(count)})`);
    }
  }

  const advisories: Record<string, AuditAdvisory> = {};
  for (const [key, value] of Object.entries(input.advisories)) {
    if (!/^\d+$/.test(key)) throw new AuditReportError(`advisories key "${key}" is not a numeric advisory id`);
    advisories[key] = parseAdvisory(key, value);
  }

  const actualCounts: Record<Severity, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const advisory of Object.values(advisories)) actualCounts[advisory.severity as Severity] += 1;
  for (const severity of SEVERITIES) {
    if (declared[severity] !== actualCounts[severity]) {
      throw new AuditReportError(
        `metadata.vulnerabilities.${severity} (${declared[severity]}) does not match the report (${actualCounts[severity]}) — inconsistent or partial report`,
      );
    }
  }

  return {
    advisories,
    metadata: {
      vulnerabilities: actualCounts,
      ...(typeof input.metadata.totalDependencies === "number"
        ? { totalDependencies: input.metadata.totalDependencies }
        : {}),
    },
  };
}

export interface AdvisoryVerdict {
  advisory: AuditAdvisory;
  allowed: boolean;
  reason?: string;
}

export interface AuditEvaluation {
  verdicts: AdvisoryVerdict[];
  violations: AdvisoryVerdict[];
}

function reasonForViolation(advisory: AuditAdvisory): string | undefined {
  if (advisory.github_advisory_id !== ALLOWED_ADVISORY.githubAdvisoryId) {
    return "not in the exception register (docs/ops/dependency-audit.md)";
  }
  if (advisory.module_name !== ALLOWED_ADVISORY.moduleName) {
    return `allow-listed GHSA now applies to "${advisory.module_name}", expected "${ALLOWED_ADVISORY.moduleName}"`;
  }
  if (advisory.vulnerable_versions !== ALLOWED_ADVISORY.vulnerableVersions) {
    return `vulnerable range changed to "${advisory.vulnerable_versions}" (expected "${ALLOWED_ADVISORY.vulnerableVersions}") — re-review the exception`;
  }
  if (advisory.patched_versions !== ALLOWED_ADVISORY.patchedVersions) {
    return `patched range changed to "${advisory.patched_versions}" (expected "${ALLOWED_ADVISORY.patchedVersions}") — re-review the exception`;
  }
  if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) {
    return "advisory has no findings to verify";
  }
  for (const finding of advisory.findings) {
    if (finding.dev !== true) {
      return "reachable from production dependencies (finding.dev is not true)";
    }
    if (!Array.isArray(finding.paths) || finding.paths.length === 0) {
      return "advisory finding has no dependency path";
    }
    for (const dependencyPath of finding.paths) {
      if (typeof dependencyPath !== "string" || dependencyPath.length === 0) {
        return "advisory finding has a malformed dependency path";
      }
      if (dependencyPath !== ALLOWED_ADVISORY.dependencyPath) {
        return `unexpected dependency path "${dependencyPath}"`;
      }
    }
  }
  return undefined;
}

export function evaluateAuditReport(report: AuditReport): AuditEvaluation {
  const advisories = Object.values(report.advisories);
  const verdicts = advisories.map((advisory) => {
    const reason = reasonForViolation(advisory);
    return reason ? { advisory, allowed: false, reason } : { advisory, allowed: true };
  });
  return { verdicts, violations: verdicts.filter((verdict) => !verdict.allowed) };
}

function stripYamlComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let quote: '"' | "'" | undefined;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
          if (char === quote) quote = undefined;
        } else if (char === '"' || char === "'") {
          quote = char;
        } else if (char === "#") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

/**
 * `auditConfig.ignoreGhsas` filters the report before it reaches this script,
 * which would make every advisory invisible. No YAML parser is available in the
 * runtime dependency tree (and adding one for this single check is not
 * warranted), so the guard is a conservative token scan over comment-stripped
 * source: it rejects block style (`auditConfig:\n  ignoreGhsas:`), flow style
 * (`auditConfig: {ignoreGhsas: [...]}`), quoted keys, and bare `ignoreGhsas`.
 */
export function findSuppressedAuditConfig(workspaceYaml: string): string | undefined {
  const stripped = stripYamlComments(workspaceYaml);
  if (/(["']?)auditConfig\1\s*:/.test(stripped) || /\bignoreGhsas\b/i.test(stripped)) {
    return "pnpm-workspace.yaml defines auditConfig/ignoreGhsas suppression, which filters `pnpm audit` output — remove it and keep the exception in this script";
  }
  return undefined;
}

function assertNoSuppression(cwd: string): void {
  const workspacePath = path.join(cwd, "pnpm-workspace.yaml");
  let workspaceYaml = "";
  try {
    workspaceYaml = readFileSync(workspacePath, "utf8");
  } catch {
    return;
  }
  const suppressed = findSuppressedAuditConfig(workspaceYaml);
  if (suppressed) throw new AuditReportError(suppressed);
}

export function describeVerdict(verdict: AdvisoryVerdict): string {
  const advisory = verdict.advisory;
  const status = verdict.allowed ? "ALLOWED (temporary exception)" : "VIOLATION";
  const detail = verdict.allowed ? ALLOWED_ADVISORY.rationale : verdict.reason;
  return `${status} ${advisory.github_advisory_id ?? advisory.id} ${advisory.module_name} ${advisory.severity} — ${detail}`;
}

function auditInvocation(): { command: string; args: string[] } {
  // When run through pnpm, npm_execpath points at pnpm's own .mjs entry point:
  // spawning node directly avoids shell:true (Node DEP0190) and Windows .cmd
  // resolution problems.
  const execPath = process.env.npm_execpath;
  if (execPath && /\.(c?js|mjs)$/.test(execPath)) {
    return { command: process.execPath, args: [execPath, "audit", "--json"] };
  }
  if (process.platform === "win32") {
    return { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "pnpm audit --json"] };
  }
  return { command: "pnpm", args: ["audit", "--json"] };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new AuditReportError(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface AuditProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

/**
 * A non-zero pnpm exit is only acceptable when it is the documented "audit
 * found advisories" code (1) *and* a complete report was printed. Every other
 * outcome (spawn failure, signal, exit 2+, empty/non-JSON stdout) fails closed.
 */
export function interpretAuditProcess(result: AuditProcessResult): AuditReport {
  if (result.error) throw new AuditReportError(`pnpm audit could not be executed: ${result.error.message}`);
  if (result.status !== 0 && result.status !== 1) {
    throw new AuditReportError(
      `pnpm audit exited with ${result.status === null ? "no status (terminated by signal?)" : result.status} — refusing to treat an unexpected exit as a clean report`,
    );
  }
  const stdout = result.stdout.trim();
  if (!stdout.startsWith("{") && !stdout.startsWith("\uFEFF{")) {
    const stderr = result.stderr.trim().slice(0, 500);
    throw new AuditReportError(
      `pnpm audit did not return JSON (exit ${result.status})${stderr ? `: ${stderr}` : ""} — registry or command failure?`,
    );
  }
  const report = parseAuditReport(parseJson(stdout));
  const advisoryCount = Object.keys(report.advisories).length;
  if (result.status === 1 && advisoryCount === 0) {
    throw new AuditReportError("pnpm audit exited 1 but the report contains no advisories — inconsistent report");
  }
  if (result.status === 0 && advisoryCount > 0) {
    throw new AuditReportError("pnpm audit exited 0 but the report contains advisories — inconsistent report");
  }
  return report;
}

function runAuditJson(): AuditReport {
  const invocation = auditInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return interpretAuditProcess({
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  });
}

export type VersionTuple = [number, number, number];
export type VersionComparators = (version: VersionTuple) => boolean;

export function parseVersion(value: string): VersionTuple | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: VersionTuple, right: VersionTuple): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

/**
 * Supports the semver subset used by advisory `patched_versions` (whitespace
 * separated `>=`, `>`, `<=`, `<`, `=` comparators over `x.y.z`). Any expression
 * it does not understand makes the registry probe indeterminate, never "safe".
 */
export function parsePatchedRange(range: string): VersionComparators | undefined {
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;
  const comparators: VersionComparators[] = [];
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=)?(v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(token);
    if (!match) return undefined;
    const operator = match[1] ?? "=";
    const bound = parseVersion(match[2]);
    if (!bound) return undefined;
    comparators.push((version) => {
      const comparison = compareVersions(version, bound);
      if (operator === ">=") return comparison >= 0;
      if (operator === ">") return comparison > 0;
      if (operator === "<=") return comparison <= 0;
      if (operator === "<") return comparison < 0;
      return comparison === 0;
    });
  }
  return (version) => comparators.every((comparator) => comparator(version));
}

export type VersionFetcher = (packageName: string) => Promise<string[]>;

export interface RegistryProbe {
  status: "patched-available" | "no-patched-version" | "indeterminate";
  detail: string;
}

function registryBaseUrl(): string {
  const configured = process.env.NPM_CONFIG_REGISTRY ?? process.env.npm_config_registry;
  return (configured && configured.trim() ? configured.trim() : "https://registry.npmjs.org").replace(/\/+$/, "");
}

/**
 * Reads the abbreviated packument (smaller than the full document) from the
 * configured npm registry with a bounded timeout. Any transport/parse problem
 * is reported as `indeterminate`; it is never interpreted as "no patch".
 */
export async function fetchPublishedVersions(
  packageName: string,
  timeoutMs: number = DEFAULT_REGISTRY_TIMEOUT_MS,
): Promise<string[]> {
  const url = `${registryBaseUrl()}/${encodeURIComponent(packageName)}`;
  const response = await fetch(url, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.versions)) {
    throw new Error(`${url} response has no "versions" map`);
  }
  return Object.keys(body.versions);
}

export async function probePatchedVersion(
  patchedRange: string,
  fetchVersions: VersionFetcher,
): Promise<RegistryProbe> {
  const satisfies = parsePatchedRange(patchedRange);
  if (!satisfies) {
    return { status: "indeterminate", detail: `patched range "${patchedRange}" is not understood by the gate` };
  }
  let versions: string[];
  try {
    versions = await fetchVersions(ALLOWED_ADVISORY.moduleName);
  } catch (error) {
    return {
      status: "indeterminate",
      detail: `registry request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!Array.isArray(versions) || versions.length === 0) {
    return { status: "indeterminate", detail: "registry returned no versions" };
  }
  const parsed = versions.flatMap((raw) => {
    const version = parseVersion(raw);
    return version ? [{ raw, version }] : [];
  });
  if (parsed.length === 0) {
    return { status: "indeterminate", detail: "registry returned no parseable versions" };
  }
  const published = parsed.find((candidate) => satisfies(candidate.version));
  if (published) {
    return {
      status: "patched-available",
      detail: `registry publishes ${published.raw}, which satisfies "${patchedRange}"`,
    };
  }
  const latest = parsed.reduce((best, candidate) =>
    compareVersions(candidate.version, best.version) > 0 ? candidate : best,
  );
  return {
    status: "no-patched-version",
    detail: `registry publishes no version satisfying "${patchedRange}" (latest ${latest.raw})`,
  };
}

export interface GateResult {
  evaluation: AuditEvaluation;
  offline: boolean;
  registry: RegistryProbe | { status: "not-required"; detail: string };
}

export interface GateOptions {
  argv: string[];
  cwd?: string;
  fetchVersions?: VersionFetcher;
}

export async function runGate(options: GateOptions): Promise<GateResult> {
  const cwd = options.cwd ?? process.cwd();
  const fetchVersions = options.fetchVersions ?? fetchPublishedVersions;
  const reportFlag = options.argv.indexOf("--report");
  const offline = reportFlag >= 0;

  let report: AuditReport;
  if (offline) {
    const reportPath = options.argv[reportFlag + 1];
    if (!reportPath) throw new AuditReportError("--report requires a path to a JSON audit report");
    let raw: string;
    try {
      raw = readFileSync(path.resolve(cwd, reportPath), "utf8");
    } catch (error) {
      throw new AuditReportError(
        `cannot read audit report "${reportPath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    report = parseAuditReport(parseJson(raw));
  } else {
    assertNoSuppression(cwd);
    report = runAuditJson();
  }

  const evaluation = evaluateAuditReport(report);
  if (evaluation.violations.length > 0) {
    return { evaluation, offline, registry: { status: "not-required", detail: "violations already fail the gate" } };
  }
  if (evaluation.verdicts.length === 0) {
    return { evaluation, offline, registry: { status: "not-required", detail: "no advisories reported" } };
  }
  if (offline) {
    return {
      evaluation,
      offline,
      registry: { status: "not-required", detail: "offline evaluation (--report): registry state was NOT checked" },
    };
  }
  const advisory = evaluation.verdicts[0].advisory;
  return { evaluation, offline, registry: await probePatchedVersion(advisory.patched_versions, fetchVersions) };
}

export function isDirectRun(moduleUrl: string, entry: string | undefined): boolean {
  if (!entry) return false;
  try {
    return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(entry);
  } catch {
    return false;
  }
}

export function decideExitCode(result: GateResult): number {
  if (result.evaluation.violations.length > 0) return EXIT_CODE.VIOLATION;
  if (result.evaluation.verdicts.length === 0) return EXIT_CODE.OK;
  if (result.offline) return EXIT_CODE.OK;
  if (result.registry.status === "patched-available") return EXIT_CODE.VIOLATION;
  if (result.registry.status === "indeterminate") return EXIT_CODE.INDETERMINATE;
  return EXIT_CODE.OK;
}

async function main() {
  const result = await runGate({ argv: process.argv.slice(2) });
  console.log(`Dependency audit: ${result.evaluation.verdicts.length} advisory(ies)`);
  for (const verdict of result.evaluation.verdicts) console.log(`  ${describeVerdict(verdict)}`);

  const code = decideExitCode(result);
  if (result.evaluation.violations.length > 0) {
    console.error(
      `FAIL ${result.evaluation.violations.length} advisory(ies) outside the reviewed exception — update the dependency or re-review docs/ops/dependency-audit.md`,
    );
  } else if (result.evaluation.verdicts.length === 0) {
    console.log("PASS clean audit: no advisories reported");
  } else if (result.offline) {
    console.log("WARN offline evaluation (--report): registry state not checked — this is NOT a release-gate result");
    console.log("PASS temporary exception only (unverified against the registry)");
  } else if (result.registry.status === "patched-available") {
    console.error(`FAIL ${result.registry.detail} — upgrade the dependency and remove the exception`);
  } else if (result.registry.status === "indeterminate") {
    console.error(`INDETERMINATE ${result.registry.detail}`);
    console.error("FAIL registry state could not be verified; the gate does not treat this as clean");
  } else {
    console.log(`PASS temporary exception only — ${result.registry.detail}; the vulnerability is NOT fixed`);
  }

  if (code !== EXIT_CODE.OK) process.exitCode = code;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT_CODE.INVALID_REPORT;
  });
}
