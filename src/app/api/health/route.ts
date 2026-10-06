import { NextResponse } from "next/server";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ status: "ok", db: "ok", latencyMs: Date.now() - started });
  } catch (e) {
    logger.error("health_db_unavailable", { error: e });
    return NextResponse.json({ status: "degraded", db: "unavailable" }, { status: 503 });
  }
}
