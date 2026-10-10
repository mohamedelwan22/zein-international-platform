import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Best-effort client IP extraction (proxy-aware).
 * Falls back to "unknown" rather than guessing.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Keyed one-way hash of an IP for forensic storage (data-model.md §2.16,
 * contracts/README.md §8: raw IPs are never stored or returned).
 * HMAC-SHA256 keyed with AUTH_SECRET — never log the result with the raw IP.
 */
export function hashIp(ip: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(ip).digest("hex");
}
