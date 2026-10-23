import { describe, expect, it } from "vitest";
import { evaluateMutationOrigin } from "@/server/http/origin-guard";

const base = {
  host: "example.test",
  origin: null,
  forwardedHost: null,
  siteUrl: null,
  fetchSite: null,
};

describe("evaluateMutationOrigin (T110)", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])("allows safe method %s", (method) => {
    expect(evaluateMutationOrigin({ ...base, method, origin: "https://evil.test" })).toEqual({
      allowed: true,
      reason: "safe-method",
    });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("requires a matching origin for %s", (method) => {
    expect(evaluateMutationOrigin({ ...base, method, origin: "https://example.test" })).toEqual({
      allowed: true,
      reason: "same-origin",
    });
    expect(evaluateMutationOrigin({ ...base, method, origin: "https://evil.test" })).toEqual({
      allowed: false,
      reason: "foreign-origin",
    });
  });

  it("matches the host case-insensitively and with an explicit port", () => {
    expect(
      evaluateMutationOrigin({
        ...base,
        method: "POST",
        host: "Example.Test:3000",
        origin: "http://example.test:3000",
      }).allowed,
    ).toBe(true);
  });

  it("accepts a reverse-proxy forwarded host", () => {
    expect(
      evaluateMutationOrigin({
        ...base,
        method: "POST",
        host: "app:3000",
        forwardedHost: "www.example.test, proxy.internal",
        origin: "https://www.example.test",
      }).allowed,
    ).toBe(true);
  });

  it("accepts the configured public site URL", () => {
    expect(
      evaluateMutationOrigin({
        ...base,
        method: "POST",
        host: "127.0.0.1:3000",
        siteUrl: "https://zain.example",
        origin: "https://zain.example",
      }).allowed,
    ).toBe(true);
  });

  it("allows requests without an Origin header (non-browser clients)", () => {
    expect(evaluateMutationOrigin({ ...base, method: "POST" })).toEqual({
      allowed: true,
      reason: "no-origin",
    });
  });

  it("rejects Sec-Fetch-Site: cross-site even without an Origin", () => {
    expect(
      evaluateMutationOrigin({ ...base, method: "POST", fetchSite: "cross-site" }),
    ).toEqual({ allowed: false, reason: "cross-site-fetch" });
  });

  it("rejects Origin: null and unparsable origins", () => {
    expect(evaluateMutationOrigin({ ...base, method: "POST", origin: "null" })).toEqual({
      allowed: false,
      reason: "null-origin",
    });
    expect(evaluateMutationOrigin({ ...base, method: "POST", origin: "not a url" })).toEqual({
      allowed: false,
      reason: "unparsable-origin",
    });
  });

  it("rejects every origin when the request carries no usable host", () => {
    expect(
      evaluateMutationOrigin({ ...base, method: "POST", host: null, origin: "https://evil.test" })
        .allowed,
    ).toBe(false);
  });
});
