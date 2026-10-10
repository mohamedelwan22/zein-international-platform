import { describe, expect, it } from "vitest";
import { verifyApprovedAssets } from "../../scripts/verify-approved-assets";

/**
 * Approved assets must be byte-identical copies of the supplied company
 * assets (Constitution XIII, US12.3): public/logo.png ≡ docs/logo.png and
 * public/hero.png ≡ docs/hero.png, verified by SHA-256. CI re-runs this via
 * `pnpm verify:assets` (T092/T118).
 */
describe("approved assets (T026, Constitution XIII)", () => {
  it("public copies are byte-identical to the approved sources", async () => {
    const results = await verifyApprovedAssets();
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.identical, `${result.copy} must equal ${result.source} byte-for-byte`).toBe(
        true,
      );
      expect(result.sourceSha256).toBe(result.copySha256);
      expect(result.byteSize).toBeGreaterThan(0);
    }
  });

  it("logo and hero hashes are distinct non-trivial assets", async () => {
    const results = await verifyApprovedAssets();
    const [logo, hero] = results;
    expect(logo.copySha256).not.toBe(hero.copySha256);
    expect(logo.copySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(hero.copySha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
