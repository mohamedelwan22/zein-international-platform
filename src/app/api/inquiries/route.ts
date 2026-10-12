import { NextResponse } from "next/server";
import { badRequest, rateLimited } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { clientIpFrom, hashIp } from "@/server/http/ip";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rateLimit";
import { createInquiry } from "@/server/services/inquiries";
import { inquirySchema, issueDetails } from "@/server/validation/inquiries";

/**
 * `POST /api/inquiries` (T057, contracts/public-api.md).
 *
 * Anonymous lead intake: server-side Zod validation (double validation by
 * design, FR-019/FR-003) → IP+email fixed-window rate limit (5 / 10 min) →
 * persist at status `new` → `201 { id, status, createdAt }`. No notification
 * is sent (Clarification 1); rate limiting is keyed on the hashed IP + email
 * so the raw IP is never stored (contracts/README.md §7).
 */

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = inquirySchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest("Validation failed", issueDetails(parsed.error));
    }

    const input = parsed.data;
    const ipHash = hashIp(clientIpFrom(request.headers));

    const result = await consumeRateLimit({
      bucketKey: `inquiry:${ipHash}:${input.email.toLowerCase()}`,
      limit: RATE_LIMITS.lead.limit,
      windowMs: RATE_LIMITS.lead.windowMs,
    });
    if (!result.allowed) {
      throw rateLimited(result.retryAfterSec ?? 60);
    }

    const created = await createInquiry(input, { ipHash });

    return NextResponse.json(
      { id: created.id, status: created.status, createdAt: created.createdAt },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
