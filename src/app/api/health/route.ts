import { NextResponse, connection } from "next/server";
import { Client } from "pg";
import { env } from "@/lib/env";

export async function GET() {
  await connection();
  let up = false;
  const client = new Client({ connectionString: env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("SELECT 1");
    up = true;
  } catch {
    up = false;
  } finally {
    await client.end().catch(() => undefined);
  }
  if (!up) {
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
  return NextResponse.json({ status: "ok", db: "up" });
}