import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness probe that also proves the database connection works. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "up", at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", database: "down" }, { status: 503 });
  }
}
