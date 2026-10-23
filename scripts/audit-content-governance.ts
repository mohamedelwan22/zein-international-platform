/**
 * Content & data governance audit (T114 / SC-010 / FR-007 / FR-037).
 *
 * Read-only. Verifies, against the live database:
 *   1. No placeholder or unapproved-claim wording in published CMS content or
 *      Settings (e.g. the "50 years of success" claim).
 *   2. Every published statistic carries a matching server-side approval
 *      (the same rule the public render enforces).
 *   3. Localized public records that would render through the fallback path
 *      are listed with their missing locale, so staff can finish the
 *      translation (FR-041 — no silent untranslated content).
 *   4. Published locations carry coordinates only inside the approved country
 *      envelope (no invented geography); unverified rows are reported.
 *   5. Every published row's provenance column is populated where the schema
 *      records an approved source document.
 *
 * Exit codes: 0 = no blocking violation, 1 = blocking violation, 2 = aborted.
 * A dated report can be written with `--report <path>`.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PLACEHOLDER_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "lorem-ipsum", pattern: /lorem\s+ipsum/i },
  { name: "todo-marker", pattern: /\b(TODO|TBD|FIXME)\b/ },
  { name: "xxx-marker", pattern: /\bXXX\b/ },
  { name: "placeholder-wording", pattern: /\bplaceholder\b/i },
  { name: "example-domain", pattern: /example\.(com|org|net)/i },
  { name: "unapproved-50-years", pattern: /50\s+years?\s+of\s+success/i },
  { name: "unapproved-50-years-ar", pattern: /50\s+عام/i },
];

/** Saudi Arabia envelope — coordinates outside it are treated as invented. */
const COUNTRY_BOUNDS = { minLat: 16.0, maxLat: 32.5, minLng: 34.5, maxLng: 56.0 };

interface Finding {
  level: "FAIL" | "WARN" | "INFO";
  check: string;
  detail: string;
}

const findings: Finding[] = [];

function record(level: Finding["level"], check: string, detail: string): void {
  findings.push({ level, check, detail });
}

function flatten(value: unknown, prefix = ""): Array<{ path: string; text: string }> {
  if (typeof value === "string") {
    return [{ path: prefix, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flatten(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      flatten(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

function statisticKey(label: string, value: string): string {
  const input = `statistics\u0000${label}\u0000${value}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `stat:${hash.toString(16).padStart(8, "0")}:${input.length}`;
}

async function auditPublishedCopy(client: Client): Promise<void> {
  const sections = await client.query<{
    sectionKey: string;
    locale: string;
    publishedContent: unknown;
    approvedFlags: unknown;
  }>(
    `select "sectionKey", "locale", "publishedContent", "approvedFlags"
       from "CmsSection"
      where "publishedContent" is not null`,
  );

  if (sections.rowCount === 0) {
    record("WARN", "cms-published", "No published CMS sections found — the public site renders empty states.");
  }

  for (const row of sections.rows) {
    const strings = flatten(row.publishedContent);
    for (const entry of strings) {
      for (const rule of PLACEHOLDER_PATTERNS) {
        if (rule.pattern.test(entry.text)) {
          record(
            "FAIL",
            "placeholder",
            `${row.sectionKey}:${row.locale} ${entry.path} matches ${rule.name}`,
          );
        }
      }
    }

    if (row.sectionKey !== "home") {
      continue;
    }
    const statistics = (row.publishedContent as { statistics?: Array<{ label: string; value: string; approved?: boolean }> })
      .statistics ?? [];
    const flags = (row.approvedFlags as Record<string, unknown> | null) ?? {};
    statistics.forEach((statistic, index) => {
      const approved = statistic.approved === true && flags[statisticKey(statistic.label, statistic.value)] === true;
      if (!approved) {
        record(
          "INFO",
          "statistic-gate",
          `${row.sectionKey}:${row.locale} statistic #${index} ("${statistic.label}") is published but NOT rendered (not approved)`,
        );
      }
    });
  }

  const settings = await client.query<{ key: string; valueEn: unknown; valueAr: unknown }>(
    `select "key", "valueEn", "valueAr" from "Settings"`,
  );
  for (const row of settings.rows) {
    for (const [locale, value] of [
      ["en", row.valueEn],
      ["ar", row.valueAr],
    ] as const) {
      for (const entry of flatten(value)) {
        for (const rule of PLACEHOLDER_PATTERNS) {
          if (rule.pattern.test(entry.text)) {
            record("FAIL", "placeholder", `Settings.${row.key}:${locale} ${entry.path} matches ${rule.name}`);
          }
        }
      }
    }
  }
}

async function auditTranslations(client: Client): Promise<void> {
  const pairs: Array<{ table: string; en: string; ar: string; where: string }> = [
    { table: "Brand", en: "nameEn", ar: "nameAr", where: `"status" = 'published'` },
    { table: "Category", en: "nameEn", ar: "nameAr", where: `"status" = 'published'` },
    { table: "Product", en: "nameEn", ar: "nameAr", where: `"status" = 'published'` },
    { table: "Supplier", en: "nameEn", ar: "nameAr", where: `"status" = 'published'` },
    { table: "Client", en: "nameEn", ar: "nameAr", where: `"status" = 'published'` },
    { table: "Location", en: "cityEn", ar: "cityAr", where: `"status" = 'published'` },
  ];

  for (const pair of pairs) {
    const result = await client.query<{ total: string; missing: string }>(
      `select count(*)::text as total,
              count(*) filter (
                where coalesce(trim("${pair.en}"), '') = '' or coalesce(trim("${pair.ar}"), '') = ''
              )::text as missing
         from "${pair.table}"
        where ${pair.where}`,
    );
    const row = result.rows[0];
    if (!row) {
      continue;
    }
    const missing = Number.parseInt(row.missing, 10);
    if (missing > 0) {
      record(
        "WARN",
        "translation-fallback",
        `${pair.table}: ${missing}/${row.total} published rows are missing a locale and will render the fallback wording`,
      );
    } else {
      record("INFO", "translation-fallback", `${pair.table}: ${row.total}/${row.total} published rows have both locales`);
    }
  }
}

async function auditCoordinates(client: Client): Promise<void> {
  const result = await client.query<{
    id: string;
    cityEn: string;
    latitude: string | null;
    longitude: string | null;
    isVerified: boolean;
  }>(
    `select "id", "cityEn", "latitude"::text, "longitude"::text, "isVerified"
       from "Location"
      where "status" = 'published' and "isActive" = true`,
  );

  let outside = 0;
  let unverifiedWithCoordinates = 0;
  for (const row of result.rows) {
    if (row.latitude === null || row.longitude === null) {
      continue;
    }
    const latitude = Number.parseFloat(row.latitude);
    const longitude = Number.parseFloat(row.longitude);
    if (
      latitude < COUNTRY_BOUNDS.minLat ||
      latitude > COUNTRY_BOUNDS.maxLat ||
      longitude < COUNTRY_BOUNDS.minLng ||
      longitude > COUNTRY_BOUNDS.maxLng
    ) {
      outside += 1;
      record("FAIL", "coordinates", `Location "${row.cityEn}" (${row.id}) is outside the approved country envelope`);
    }
    if (!row.isVerified) {
      unverifiedWithCoordinates += 1;
    }
  }
  record(
    "INFO",
    "coordinates",
    `${result.rowCount} published locations; ${outside} outside the envelope; ${unverifiedWithCoordinates} carry coordinates without isVerified`,
  );
}

async function auditProvenance(client: Client): Promise<void> {
  const result = await client.query<{ total: string; missing: string }>(
    `select count(*)::text as total,
            count(*) filter (where coalesce(trim("sourceDoc"), '') = '')::text as missing
       from "CmsSection"
      where "publishedContent" is not null`,
  );
  const row = result.rows[0];
  if (row && Number.parseInt(row.missing, 10) > 0) {
    record("WARN", "provenance", `${row.missing}/${row.total} published CMS sections have no sourceDoc reference (SC-010)`);
  } else if (row) {
    record("INFO", "provenance", `${row.total}/${row.total} published CMS sections carry a sourceDoc reference`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: pnpm exec tsx scripts/audit-content-governance.ts [--report <path>]");
    return;
  }
  const reportIndex = args.indexOf("--report");
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL is not set — cannot audit content governance.");
    process.exitCode = 2;
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await auditPublishedCopy(client);
    await auditTranslations(client);
    await auditCoordinates(client);
    await auditProvenance(client);
  } finally {
    await client.end();
  }

  for (const finding of findings) {
    console.log(`${finding.level.padEnd(4)} [${finding.check}] ${finding.detail}`);
  }

  const failures = findings.filter((finding) => finding.level === "FAIL");
  const warnings = findings.filter((finding) => finding.level === "WARN");
  console.log(
    `\nContent governance: ${failures.length} blocking violation(s), ${warnings.length} warning(s), ${findings.length} finding(s) total.`,
  );

  if (reportPath) {
    const target = path.resolve(reportPath);
    await mkdir(path.dirname(target), { recursive: true });
    const body = [
      `# Content governance audit — ${new Date().toISOString()}`,
      "",
      `Verdict: **${failures.length === 0 ? "PASS" : "FAIL"}** (${failures.length} blocking, ${warnings.length} warning)`,
      "",
      "| Level | Check | Detail |",
      "| --- | --- | --- |",
      ...findings.map((finding) => `| ${finding.level} | ${finding.check} | ${finding.detail.replace(/\|/g, "\\|")} |`),
      "",
    ].join("\n");
    await writeFile(target, body, "utf8");
    console.log(`Report written: ${target}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
