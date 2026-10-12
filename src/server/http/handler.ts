import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { HttpError, httpStatusFor, toErrorPayload } from "./errors";

/**
 * Route-handler helpers (T057, contracts/README.md §4).
 *
 * One place turns a thrown `HttpError` (or any unexpected error) into the
 * contract error envelope with the right status, the `Retry-After` header on
 * `429`, and a logged 500 — so handlers stay a thin validation → service layer.
 */

const logger = createLogger("http");

export function errorResponse(error: unknown): NextResponse {
  const status = httpStatusFor(error);
  const payload = toErrorPayload(error);
  const headers: Record<string, string> = {};

  if (error instanceof HttpError && error.retryAfter) {
    headers["Retry-After"] = String(error.retryAfter);
  }
  if (status >= 500) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "Unhandled route error",
    );
  }

  return NextResponse.json(payload, { status, headers });
}

/** Parse a JSON body, throwing `400 VALIDATION_FAILED` on malformed input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError("VALIDATION_FAILED", "Request body must be valid JSON");
  }
}
