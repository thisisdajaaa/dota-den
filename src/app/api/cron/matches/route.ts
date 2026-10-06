import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/common/http/cron-auth";
import { env } from "@/common/config/env";
import { apiError } from "@/common/http/http";
import { runMatchSync } from "./run-match-sync";

export const maxDuration = 60;

/**
 * Daily match sync for every player, called by Vercel Cron (see vercel.json). Finishes long
 * history imports and picks up new games without the player visiting (on-visit syncs only
 * cover a few pages, and background continuation otherwise needs QStash).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) return apiError("upstream_unavailable", "Cron is not configured");
  if (!isCronAuthorized(req, secret)) return apiError("unauthorized", "Invalid cron credentials");
  return NextResponse.json(await runMatchSync("cron"));
}
