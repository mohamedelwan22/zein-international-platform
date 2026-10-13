import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { getAllSettings } from "@/server/services/settings";

export async function GET() {
  try {
    await requirePermission("settings:read");
    const settings = await getAllSettings();
    return NextResponse.json(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
