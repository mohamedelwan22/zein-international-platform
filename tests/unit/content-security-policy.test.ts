import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/content-security-policy";

describe("buildContentSecurityPolicy", () => {
  it("allows only the Google Maps frame origins used by location embeds", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain(
      "frame-src 'self' https://www.google.com https://google.com https://maps.google.com",
    );
    expect(policy).not.toContain("frame-src 'none'");
    expect(policy).not.toContain("frame-src *");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
  });

  it("keeps development-only relaxations out of production", () => {
    const production = buildContentSecurityPolicy(true);
    const development = buildContentSecurityPolicy(false);

    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain("ws: wss:");
    expect(production).toContain("upgrade-insecure-requests");

    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("ws: wss:");
    expect(development).not.toContain("upgrade-insecure-requests");
  });
});
