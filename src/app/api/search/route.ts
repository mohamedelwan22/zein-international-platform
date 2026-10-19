import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http/handler";
import { hashIp, clientIpFrom } from "@/server/http/ip";
import { rateLimited } from "@/server/http/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rateLimit";
import { parseSearchParams, runSearch } from "@/server/services/search";

/**
 * `GET /api/search` (T099, contracts/public-api.md, FR-015, SC-006).
 *
 * Anonymous catalog search across Product/Brand/Supplier/Category.
 *
 * - `q` is required, minimum 2 characters → otherwise `400 VALIDATION_FAILED`;
 * - `type` (`product|brand|supplier|category`, default all four), `locale`
 *   (`en|ar`, default `en`), `page` and `pageSize` are optional and clamped;
 * - rate limited to 30 / min / IP (`RateLimitCounter`), keyed on the HMAC of
 *   the IP so a raw address is never written (contracts/README.md §7, §8);
 * - a zero-match query is a `200` with empty `items` — the localized empty
 *   state is a UI concern, not an error (spec SC-006).
 *
 * There is no cache tag here: results must reflect a publish immediately, and
 * the endpoint is anonymous + rate limited, so a response cache would only
 * ever serve stale data.
 */

export async function GET(request: Request) {
  try {
    const ipHash = hashIp(clientIpFrom(request.headers));
    const limit = await consumeRateLimit({
      bucketKey: `search:${ipHash}`,
      limit: RATE_LIMITS.search.limit,
      windowMs: RATE_LIMITS.search.windowMs,
    });
    if (!limit.allowed) {
      throw rateLimited(limit.retryAfterSec ?? 60);
    }

    const params = parseSearchParams(new URL(request.url).searchParams);
    return NextResponse.json(await runSearch(params));
  } catch (error) {
    return errorResponse(error);
  }
}
