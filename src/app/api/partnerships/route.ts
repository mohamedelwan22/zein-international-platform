import { NextResponse } from "next/server";
import { badRequest, rateLimited } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { clientIpFrom, hashIp } from "@/server/http/ip";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rateLimit";
import {
  createPartnershipRequest,
  type PartnershipAttachmentInput,
} from "@/server/services/partnerships";
import { issueDetails } from "@/server/validation/inquiries";
import { partnershipSchema } from "@/server/validation/partnerships";

/**
 * `POST /api/partnerships` (T064, contracts/public-api.md).
 *
 * Anonymous partnership intake: accepts `application/json` (no attachment) or
 * `multipart/form-data` (with an optional document). Field validation runs
 * first (`400`), then the IP+email fixed-window limit (5 / 10 min, `429`), then
 * the attachment is magic-byte + size validated inside the service (`415`/`413`)
 * and stored through `MediaStorage`. The response is minimalist and no
 * notification is sent (Clarification 1).
 */

interface ParsedBody {
  fields: Record<string, unknown>;
  attachment: PartnershipAttachmentInput | null;
}

async function parseMultipart(request: Request): Promise<ParsedBody> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Malformed multipart body");
  }

  const fields: Record<string, unknown> = {};
  let attachment: PartnershipAttachmentInput | null = null;

  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }
    if (key === "attachment" && value.size > 0) {
      attachment = {
        buffer: Buffer.from(await value.arrayBuffer()),
        originalName: value.name || "attachment",
        declaredMime: value.type || null,
      };
    }
  }

  // FormData carries the consent checkbox as a string.
  if (typeof fields.consentAccepted === "string") {
    fields.consentAccepted =
      fields.consentAccepted === "true" || fields.consentAccepted === "on";
  }

  return { fields, attachment };
}

async function parseBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return parseMultipart(request);
  }
  if (contentType.includes("application/json") || contentType === "") {
    return { fields: (await readJson(request)) as Record<string, unknown>, attachment: null };
  }
  throw badRequest("Unsupported content type");
}

export async function POST(request: Request) {
  try {
    const { fields, attachment } = await parseBody(request);
    const parsed = partnershipSchema.safeParse(fields);
    if (!parsed.success) {
      throw badRequest("Validation failed", issueDetails(parsed.error));
    }

    const input = parsed.data;
    const ipHash = hashIp(clientIpFrom(request.headers));

    const result = await consumeRateLimit({
      bucketKey: `partnership:${ipHash}:${input.email.toLowerCase()}`,
      limit: RATE_LIMITS.lead.limit,
      windowMs: RATE_LIMITS.lead.windowMs,
    });
    if (!result.allowed) {
      throw rateLimited(result.retryAfterSec ?? 60);
    }

    const created = await createPartnershipRequest(input, { ipHash, attachment });

    return NextResponse.json(
      { id: created.id, status: created.status, createdAt: created.createdAt },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
