import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_ADVISORY,
  AuditReportError,
  EXIT_CODE,
  type AuditAdvisory,
  type AuditReport,
  type GateResult,
  decideExitCode,
  evaluateAuditReport,
  findSuppressedAuditConfig,
  interpretAuditProcess,
  isDirectRun,
  parseAuditReport,
  parsePatchedRange,
  probePatchedVersion,
  runGate,
} from "../../scripts/verify-dependency-audit";

function bracesAdvisory(overrides: Partial<AuditAdvisory> = {}): AuditAdvisory {
  return {
    id: 1240992,
    title: "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
    module_name: ALLOWED_ADVISORY.moduleName,
    vulnerable_versions: ALLOWED_ADVISORY.vulnerableVersions,
    patched_versions: ALLOWED_ADVISORY.patchedVersions,
    severity: "high",
    github_advisory_id: ALLOWED_ADVISORY.githubAdvisoryId,
    findings: [
      {
        version: "3.0.3",
        paths: [ALLOWED_ADVISORY.dependencyPath],
        dev: true,
        optional: false,
        bundled: false,
      },
    ],
    ...overrides,
  };
}

function reportOf(...advisories: AuditAdvisory[]): AuditReport {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const advisory of advisories) {
    if (advisory.severity in vulnerabilities) {
      vulnerabilities[advisory.severity as keyof typeof vulnerabilities] += 1;
    }
  }
  return {
    advisories: Object.fromEntries(advisories.map((advisory) => [String(advisory.id), advisory])),
    metadata: { vulnerabilities },
  };
}

function evaluateRaw(input: unknown) {
  return evaluateAuditReport(parseAuditReport(input));
}

describe("audit report validation (fail closed)", () => {
  it("accepts a complete pnpm audit report", () => {
    const parsed = parseAuditReport(reportOf(bracesAdvisory()));
    expect(Object.keys(parsed.advisories)).toEqual(["1240992"]);
    expect(parsed.metadata.vulnerabilities.high).toBe(1);
  });

  it.each([
    ["empty object", {}],
    ["registry error payload", { error: { code: "ENETUNREACH" } }],
    ["null advisories", { advisories: null, metadata: { vulnerabilities: {} } }],
    ["missing metadata", { advisories: {} }],
    ["null metadata", { advisories: {}, metadata: null }],
    ["missing vulnerabilities", { advisories: {}, metadata: {} }],
    ["null vulnerabilities", { advisories: {}, metadata: { vulnerabilities: null } }],
    ["non-numeric severity count", { advisories: {}, metadata: { vulnerabilities: { high: "1" } } }],
    ["array input", []],
    ["string input", "{not an object}"],
    ["null input", null],
  ])("rejects %s", (_label, input) => {
    expect(() => parseAuditReport(input)).toThrow(AuditReportError);
  });

  it("rejects a per-severity count that does not match the advisories", () => {
    const report = reportOf(bracesAdvisory());
    report.metadata.vulnerabilities.critical = 1;
    expect(() => parseAuditReport(report)).toThrow(/does not match/);
  });

  it("rejects an advisory without findings", () => {
    expect(() => parseAuditReport(reportOf(bracesAdvisory({ findings: [] })))).toThrow(/findings/);
  });

  it("rejects a finding with absent or empty paths (D4)", () => {
    const emptyPaths = bracesAdvisory({
      findings: [{ version: "3.0.3", paths: [], dev: true, optional: false, bundled: false }],
    });
    expect(() => parseAuditReport(reportOf(emptyPaths))).toThrow(/paths/);

    const malformed = bracesAdvisory({
      findings: [{ version: "3.0.3", paths: [""], dev: true, optional: false, bundled: false }],
    });
    expect(() => parseAuditReport(reportOf(malformed))).toThrow(/paths\[0\]/);

    const missing = bracesAdvisory({
      findings: [{ version: "3.0.3", dev: true, optional: false, bundled: false } as never],
    });
    expect(() => parseAuditReport(reportOf(missing))).toThrow(/paths/);
  });

  it("rejects an unknown severity", () => {
    expect(() => parseAuditReport(reportOf(bracesAdvisory({ severity: "urgent" })))).toThrow(/severity/);
  });
});

describe("audit process interpretation (fail closed)", () => {
  const validStdout = JSON.stringify(reportOf(bracesAdvisory()));

  it("accepts exit 1 with a complete report (advisories found)", () => {
    const report = interpretAuditProcess({ status: 1, stdout: validStdout, stderr: "" });
    expect(Object.keys(report.advisories)).toHaveLength(1);
  });

  it("accepts exit 0 with a complete clean report", () => {
    const clean = JSON.stringify(reportOf());
    expect(interpretAuditProcess({ status: 0, stdout: clean, stderr: "" }).advisories).toEqual({});
  });

  it.each([
    ["exit 2", { status: 2, stdout: validStdout, stderr: "" }],
    ["killed by signal", { status: null, stdout: validStdout, stderr: "" }],
    ["spawn error", { status: null, stdout: "", stderr: "", error: new Error("ENOENT") }],
    ["empty stdout", { status: 1, stdout: "", stderr: "network down" }],
    ["non-JSON stdout", { status: 1, stdout: "Error: ENETUNREACH", stderr: "network down" }],
    ["malformed JSON", { status: 1, stdout: "{not json", stderr: "" }],
    ["registry error payload", { status: 1, stdout: JSON.stringify({ error: { code: "ENETUNREACH" } }), stderr: "" }],
  ])("rejects %s", (_label, result) => {
    expect(() => interpretAuditProcess(result as never)).toThrow(AuditReportError);
  });
});

describe("advisory allow/deny matrix", () => {
  it("accepts the documented dev-only braces exception", () => {
    const evaluation = evaluateRaw(reportOf(bracesAdvisory()));
    expect(evaluation.violations).toEqual([]);
    expect(evaluation.verdicts[0].allowed).toBe(true);
  });

  it("accepts a clean report", () => {
    expect(evaluateRaw(reportOf()).violations).toEqual([]);
  });

  it("fails on any advisory outside the register", () => {
    const evaluation = evaluateRaw(
      reportOf(
        bracesAdvisory(),
        bracesAdvisory({ id: 999, github_advisory_id: "GHSA-aaaa-bbbb-cccc", module_name: "lodash" }),
      ),
    );
    expect(evaluation.violations).toHaveLength(1);
    expect(evaluation.violations[0].reason).toContain("exception register");
  });

  it("fails when the exception becomes reachable in production", () => {
    const evaluation = evaluateRaw(
      reportOf(
        bracesAdvisory({
          findings: [
            { version: "3.0.3", paths: [ALLOWED_ADVISORY.dependencyPath], dev: false, optional: false, bundled: false },
          ],
        }),
      ),
    );
    expect(evaluation.violations[0].reason).toContain("production");
  });

  it("fails when the exception reaches a different dependency path", () => {
    const evaluation = evaluateRaw(
      reportOf(
        bracesAdvisory({
          findings: [{ version: "3.0.3", paths: [".>next>braces"], dev: true, optional: false, bundled: false }],
        }),
      ),
    );
    expect(evaluation.violations[0].reason).toContain("unexpected dependency path");
  });

  it("fails when the allow-listed GHSA applies to another module", () => {
    const evaluation = evaluateRaw(reportOf(bracesAdvisory({ module_name: "micromatch" })));
    expect(evaluation.violations[0].reason).toContain("micromatch");
  });

  it("fails when the vulnerable range changes", () => {
    const evaluation = evaluateRaw(reportOf(bracesAdvisory({ vulnerable_versions: "<=3.0.2" })));
    expect(evaluation.violations[0].reason).toContain("vulnerable range");
  });

  it("fails when the patched range changes", () => {
    const evaluation = evaluateRaw(reportOf(bracesAdvisory({ patched_versions: ">=3.0.4 <4" })));
    expect(evaluation.violations[0].reason).toContain("patched range");
  });
});

describe("suppression guard (D3)", () => {
  it.each([
    ["block style", "allowBuilds:\n  sharp: true\nauditConfig:\n  ignoreGhsas:\n    - GHSA-x\n"],
    ["flow style", "allowBuilds:\n  sharp: true\nauditConfig: {ignoreGhsas: [GHSA-x]}\n"],
    ["quoted key", "allowBuilds:\n  sharp: true\n\"auditConfig\":\n  ignoreGhsas: [GHSA-x]\n"],
    ["bare ignoreGhsas", "allowBuilds:\n  sharp: true\nignoreGhsas: [GHSA-x]\n"],
  ])("rejects %s", (_label, source) => {
    expect(findSuppressedAuditConfig(source)).toContain("suppression");
  });

  it("ignores comments and unrelated configuration", () => {
    expect(findSuppressedAuditConfig("allowBuilds:\n  sharp: true\n# auditConfig: example only\n")).toBeUndefined();
    expect(findSuppressedAuditConfig("allowBuilds:\n  sharp: true\n")).toBeUndefined();
  });
});

describe("registry patch probe (D2)", () => {
  it("accepts the supported comparator subset", () => {
    expect(parsePatchedRange(">=3.0.4")?.([3, 0, 4])).toBe(true);
    expect(parsePatchedRange(">=3.0.4")?.([3, 0, 3])).toBe(false);
    expect(parsePatchedRange(">=3.0.4")?.([4, 0, 0])).toBe(true);
    expect(parsePatchedRange(">=1.0.0 <2.0.0")?.([1, 5, 0])).toBe(true);
    expect(parsePatchedRange(">=1.0.0 <2.0.0")?.([2, 0, 0])).toBe(false);
    expect(parsePatchedRange("latest")).toBeUndefined();
    expect(parsePatchedRange(">=3.0.4 <4")).toBeUndefined();
  });

  it("reports no patched version when only vulnerable releases exist", async () => {
    const probe = await probePatchedVersion(">=3.0.4", async () => ["3.0.2", "3.0.3"]);
    expect(probe.status).toBe("no-patched-version");
    expect(probe.detail).toContain("3.0.3");
  });

  it("reports a patched version when one is published", async () => {
    const probe = await probePatchedVersion(">=3.0.4", async () => ["3.0.3", "3.0.4"]);
    expect(probe.status).toBe("patched-available");
    expect(probe.detail).toContain("3.0.4");
  });

  it("compares versions numerically, not lexicographically", async () => {
    const probe = await probePatchedVersion(">=3.0.4", async () => ["3.0.3", "3.0.10"]);
    expect(probe.status).toBe("patched-available");
  });

  it("is indeterminate when the registry cannot be reached", async () => {
    const probe = await probePatchedVersion(">=3.0.4", async () => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    });
    expect(probe.status).toBe("indeterminate");
    expect(probe.detail).toContain("ENOTFOUND");
  });

  it.each([
    ["an empty version list", async () => [] as string[]],
    ["unparseable versions", async () => ["not-a-version"]],
  ])("is indeterminate for %s", async (_label, fetcher) => {
    const probe = await probePatchedVersion(">=3.0.4", fetcher);
    expect(probe.status).toBe("indeterminate");
  });

  it("is indeterminate when the patched range cannot be parsed", async () => {
    let called = false;
    const probe = await probePatchedVersion("^3.0.4", async () => {
      called = true;
      return ["3.0.4"];
    });
    expect(probe.status).toBe("indeterminate");
    expect(called).toBe(false);
  });
});

describe("gate orchestration", () => {
  function writeReport(content: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), "zein-audit-"));
    const file = path.join(dir, "audit.json");
    writeFileSync(file, content, "utf8");
    return file;
  }

  it("evaluates a captured report without touching the registry (offline)", async () => {
    const file = writeReport(JSON.stringify(reportOf(bracesAdvisory())));
    const result = await runGate({ argv: ["--report", file] });
    expect(result.offline).toBe(true);
    expect(result.evaluation.violations).toEqual([]);
    expect(result.registry.status).toBe("not-required");
    expect(decideExitCode(result)).toBe(EXIT_CODE.OK);
  });

  it("fails a captured report containing an unexpected advisory", async () => {
    const file = writeReport(
      JSON.stringify(reportOf(bracesAdvisory(), bracesAdvisory({ id: 999, github_advisory_id: "GHSA-x", module_name: "lodash" }))),
    );
    const result = await runGate({ argv: ["--report", file] });
    expect(result.evaluation.violations).toHaveLength(1);
    expect(decideExitCode(result)).toBe(EXIT_CODE.VIOLATION);
  });

  it("rejects malformed JSON in --report", async () => {
    const file = writeReport("{not json");
    await expect(runGate({ argv: ["--report", file] })).rejects.toThrow(AuditReportError);
  });

  it("rejects --report without a path", async () => {
    await expect(runGate({ argv: ["--report"] })).rejects.toThrow(/requires a path/);
  });

  it("fails closed when the captured report is a registry error payload", async () => {
    const file = writeReport(JSON.stringify({ error: { code: "ENETUNREACH" } }));
    await expect(runGate({ argv: ["--report", file] })).rejects.toThrow(AuditReportError);
  });

  function resultWith(registry: GateResult["registry"]): GateResult {
    const evaluation = evaluateAuditReport(reportOf(bracesAdvisory()));
    return { evaluation, offline: false, registry };
  }

  it("maps registry outcomes to exit codes", () => {
    expect(decideExitCode(resultWith({ status: "no-patched-version", detail: "" }))).toBe(EXIT_CODE.OK);
    expect(decideExitCode(resultWith({ status: "patched-available", detail: "" }))).toBe(EXIT_CODE.VIOLATION);
    expect(decideExitCode(resultWith({ status: "indeterminate", detail: "" }))).toBe(EXIT_CODE.INDETERMINATE);
    expect(decideExitCode(resultWith({ status: "not-required", detail: "" }))).toBe(EXIT_CODE.OK);
  });
});

describe("direct execution detection (D6)", () => {
  it("matches the resolved entry point", () => {
    const url = pathToFileURL(path.join(path.sep, "app", "scripts", "verify-dependency-audit.ts")).href;
    expect(isDirectRun(url, path.join(path.sep, "app", "scripts", "verify-dependency-audit.ts"))).toBe(true);
    expect(isDirectRun(url, path.join(path.sep, "app", "scripts", "other.ts"))).toBe(false);
    expect(isDirectRun(url, undefined)).toBe(false);
  });
});
