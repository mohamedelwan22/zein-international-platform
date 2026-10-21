import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/server/http/handler";
import { createSlugRedirect, listSlugRedirects } from "@/server/services/seo";

/** Slug redirect overrides (admin-api.md §7); `seo:update` is enforced. */
export async function GET() {
  try {
    return NextResponse.json({ items: await listSlugRedirects() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createSlugRedirect(await readJson(request)), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
