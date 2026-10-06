/** Turning a data export into downloadable files (pure). */

export type ExportFormat = "json" | "matches-csv" | "mmr-csv";
export const EXPORT_FORMATS = ["json", "matches-csv", "mmr-csv"] as const;

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string;
}

const csvCell = (v: unknown): string => {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: ReadonlyArray<Record<string, unknown>>, columns: readonly string[]) {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join(
    "\n",
  );
}

export const MATCH_COLUMNS = [
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
] as const;
export const MMR_COLUMNS = ["observedAt", "mmr", "note", "createdAt"] as const;

type Row = Record<string, unknown>;

/** The export as a file in the chosen format. `day` is YYYY-MM-DD for the file name. */
export function exportFile(data: Record<string, unknown>, format: ExportFormat, day: string) {
  if (format === "matches-csv") {
    // Nested queue and patch objects flatten to their labels.
    const rows = ((data.matches as Row[] | undefined) ?? []).map((m) => ({
      ...m,
      queue: (m.queue as { queueClass?: string } | undefined)?.queueClass ?? null,
      patch: (m.patch as { patch?: string } | undefined)?.patch ?? null,
    }));
    return {
      filename: `dota-den-matches-${day}.csv`,
      contentType: "text/csv",
      body: toCsv(rows, MATCH_COLUMNS),
    };
  }
  if (format === "mmr-csv")
    return {
      filename: `dota-den-mmr-${day}.csv`,
      contentType: "text/csv",
      body: toCsv((data.mmrEntries as Row[] | undefined) ?? [], MMR_COLUMNS),
    };
  return {
    filename: `dota-den-data-${day}.json`,
    contentType: "application/json",
    body: JSON.stringify(data, null, 2),
  };
}
