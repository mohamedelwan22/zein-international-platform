/**
 * Approved-asset integrity check (T026, Constitution XIII, US12.3).
 *
 * `public/logo.png` and `public/hero.png` must remain byte-identical copies
 * of `docs/logo.png` and `docs/hero.png` — never regenerated, recolored,
 * filtered, or distorted. This script (also run by CI per T092/T118) fails
 * on any byte difference.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const APPROVED_ASSETS = [
  { source: "docs/logo.png", copy: "public/logo.png" },
  { source: "docs/hero.png", copy: "public/hero.png" },
] as const;

/**
 * Any file served from `public/` is part of the approved visual identity, so
 * the manifest must be exhaustive (T114): an unlisted asset is ungoverned
 * content and fails the gate. All other imagery is delivered through the
 * governed media library (`GET /api/media/{id}`), never from `public/`.
 */
export async function findUngovernedPublicAssets(root: string = process.cwd()): Promise<string[]> {
  const allowed = new Set(APPROVED_ASSETS.map((asset) => asset.copy.replace(/^public\//, "")));
  const entries = await readdir(path.join(root, "public"), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const parent = entry.parentPath ?? "";
      const relative = path.relative(path.join(root, "public"), path.join(parent, entry.name));
      return relative.replace(/\\/g, "/");
    })
    .filter((relative) => !allowed.has(relative))
    .sort();
}

export interface AssetCheck {
  source: string;
  copy: string;
  sourceSha256: string;
  copySha256: string;
  byteSize: number;
  identical: boolean;
}

export async function sha256File(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

export async function verifyApprovedAssets(root: string = process.cwd()): Promise<AssetCheck[]> {
  const results: AssetCheck[] = [];
  for (const asset of APPROVED_ASSETS) {
    const sourcePath = path.join(root, asset.source);
    const copyPath = path.join(root, asset.copy);
    const sourceData = await readFile(sourcePath);
    const copyData = await readFile(copyPath);
    results.push({
      source: asset.source,
      copy: asset.copy,
      sourceSha256: createHash("sha256").update(sourceData).digest("hex"),
      copySha256: createHash("sha256").update(copyData).digest("hex"),
      byteSize: copyData.byteLength,
      identical: sourceData.equals(copyData),
    });
  }
  return results;
}

async function main() {
  const results = await verifyApprovedAssets();
  let ok = true;
  for (const result of results) {
    const status = result.identical ? "OK  " : "FAIL";
    console.log(`${status} ${result.copy} sha256=${result.copySha256} (${result.byteSize} bytes)`);
    if (!result.identical || result.byteSize === 0) ok = false;
  }

  const ungoverned = await findUngovernedPublicAssets();
  if (ungoverned.length > 0) {
    ok = false;
    console.error(
      `FAIL ungoverned file(s) under public/: ${ungoverned.join(", ")} — add them to APPROVED_ASSETS with an approved source, or serve them from the media library.`,
    );
  } else {
    console.log("OK   public/ contains only the approved asset manifest");
  }

  if (!ok) {
    console.error("Approved assets are not byte-identical to their sources.");
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/verify-approved-assets.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
