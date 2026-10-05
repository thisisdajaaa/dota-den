import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import { exportAllMyData } from "@/modules/privacy/composition";

const csvCell = (v: unknown): string => {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join(
    "\n",
  );
}

/** Download everything Dota Den keeps about you: JSON, or CSV for matches and MMR. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  if (!(await rateLimit(`export:${user.id}`, 10, 60 * 60_000))) {
    return apiError("rate_limited", "Too many downloads. Try again later.");
  }
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const data = await exportAllMyData({ userId: user.id, accountId32: user.accountId32 });
  const day = new Date().toISOString().slice(0, 10);
  const file = (name: string, body: string, type: string) =>
    new NextResponse(body, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  if (format === "matches-csv") {
    const rows = (data.matches as Array<Record<string, unknown>>).map((m) => ({
      ...m,
      queue: (m.queue as { queueClass?: string } | undefined)?.queueClass ?? null,
      patch: (m.patch as { patch?: string } | undefined)?.patch ?? null,
    }));
    const cols = [
      "matchId",
      "startedAt",
      "heroId",
      "side",
      "result",
      "kills",
      "deaths",
      "assists",
      "durationSec",
      "ranked",
      "queue",
      "patch",
      "gameMode",
      "lobbyType",
    ];
    return file(`dota-den-matches-${day}.csv`, toCsv(rows, cols), "text/csv");
  }
  if (format === "mmr-csv") {
    const cols = ["observedAt", "mmr", "note", "createdAt"];
    return file(
      `dota-den-mmr-${day}.csv`,
      toCsv(data.mmrEntries as Array<Record<string, unknown>>, cols),
      "text/csv",
    );
  }
  if (format !== "json") return apiError("bad_request", "Unknown format");
  return file(`dota-den-data-${day}.json`, JSON.stringify(data, null, 2), "application/json");
}
