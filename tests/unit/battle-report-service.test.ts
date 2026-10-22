import { describe, expect, it } from "vitest";
import type { ReportGame } from "@/modules/report/domain/battle-report";
import { parseReportRange } from "@/modules/report/domain/report-range";
import type { ReplaySummary } from "@/modules/report/domain/replay-summary";
import { importedReportGame } from "@/modules/report/infrastructure/imported-report-source";
import type { ReplayReadsPort } from "@/modules/report/report.ports";
import {
  BattleReportService,
  REPLAY_NEW_PER_VIEW,
} from "@/modules/report/services/battle-report.service";

const NOW = new Date("2026-10-15T12:00:00Z");
const owner = { userId: "u1", accountId32: 42 };
const range = parseReportRange({ days: "30" }, "2026-10-15");

let n = 0;
const game = (daysAgo: number, over: Partial<ReportGame> = {}): ReportGame => ({
  matchId: String(++n),
  startedAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
  durationSec: 2_000,
  heroId: 1,
  side: "radiant",
  won: true,
  kills: 5,
  deaths: 2,
  assists: 8,
  goldPerMin: 500,
  xpPerMin: 600,
  lastHits: 150,
  denies: 10,
  heroDamage: 20_000,
  heroHealing: 0,
  towerDamage: 1_000,
  laneRole: 1,
  parsed: false,
  ...over,
});

const summary: ReplaySummary = {
  lane: "won",
  roshanKills: 1,
  campsStacked: 2,
  dewards: 3,
  powerRunes: 4,
  bountyRunes: 5,
};

class MemoryReads implements ReplayReadsPort {
  saved = new Map<string, ReplaySummary>();
  async find(_id: number, ids: readonly string[]) {
    return new Map(ids.flatMap((m) => (this.saved.has(m) ? [[m, this.saved.get(m)!]] : [])));
  }
  async save(matchId: string, _id: number, s: ReplaySummary) {
    this.saved.set(matchId, s);
  }
  async countForOwner() {
    return this.saved.size;
  }
  async deleteForOwner() {
    return 0;
  }
}

function setup(opts: {
  listed: ReportGame[] | null | (() => Promise<ReportGame[] | null>);
  imported?: ReportGame[] | (() => Promise<ReportGame[]>);
}) {
  const calls = { listed: 0, imported: 0, replays: [] as string[] };
  const reads = new MemoryReads();
  const service = new BattleReportService({
    games: {
      games: async () => {
        calls.listed++;
        return typeof opts.listed === "function" ? opts.listed() : opts.listed;
      },
    },
    imported: {
      games: async () => {
        calls.imported++;
        return typeof opts.imported === "function" ? opts.imported() : (opts.imported ?? []);
      },
    },
    replays: {
      read: async (matchId) => {
        calls.replays.push(matchId);
        return summary;
      },
    },
    reads,
    mmr: { entries: async () => [], rankedResults: async () => [] },
    now: () => NOW,
  });
  return { service, calls, reads };
}

describe("BattleReportService", () => {
  it("builds the totals from OpenDota without reading any replay", async () => {
    const listed = [game(1), game(2, { won: false, parsed: true }), game(40)];
    const { service, calls } = setup({ listed });
    const view = await service.report(owner, range, "UTC");
    expect(view).toMatchObject({ source: "opendota", from: range.from, to: range.to });
    expect(view!.report.games).toBe(2);
    expect(view!.previous.totals.games).toBe(1);
    expect(calls.replays).toEqual([]);
    expect(calls.imported).toBe(0);
  });

  it("falls back to imported games when OpenDota fails, without replay data", async () => {
    const imported = [game(1, { goldPerMin: null, laneRole: null }), game(3, { won: false })];
    for (const listed of [null, () => Promise.reject(new Error("timeout"))]) {
      const { service, calls } = setup({ listed, imported });
      const view = await service.report(owner, range, "UTC");
      expect(view?.source).toBe("imported");
      expect(view!.report.games).toBe(2);
      expect(view!.report.wins).toBe(1);
      expect(calls.imported).toBe(1);
      expect(calls.replays).toEqual([]);
    }
  });

  it("is unavailable when OpenDota fails and nothing is imported (or imports can't be read)", async () => {
    expect(await setup({ listed: null, imported: [] }).service.report(owner, range, "UTC")).toBe(
      null,
    );
    const broken = setup({ listed: null, imported: () => Promise.reject(new Error("db")) });
    expect(await broken.service.report(owner, range, "UTC")).toBe(null);
  });

  it("reads a few new parsed replays per view, newest first, and keeps them", async () => {
    const parsed = Array.from({ length: REPLAY_NEW_PER_VIEW + 2 }, (_, i) =>
      game(i + 1, { parsed: true }),
    );
    const { service, calls, reads } = setup({ listed: [...parsed, game(1)] });
    const first = await service.replays(owner, range, "UTC");
    expect(calls.replays).toEqual(parsed.slice(0, REPLAY_NEW_PER_VIEW).map((g) => g.matchId));
    expect(first).toMatchObject({
      parsedInPeriod: parsed.length,
      aggregate: { games: REPLAY_NEW_PER_VIEW },
    });
    expect(reads.saved.size).toBe(REPLAY_NEW_PER_VIEW);

    const second = await service.replays(owner, range, "UTC");
    expect(calls.replays).toHaveLength(parsed.length);
    expect(second!.aggregate.games).toBe(parsed.length);
  });

  it("has no replay stats when OpenDota fails", async () => {
    const { service } = setup({ listed: null, imported: [game(1)] });
    expect(await service.replays(owner, range, "UTC")).toBe(null);
  });
});

describe("importedReportGame", () => {
  it("keeps what the import has and leaves the rest missing, never parsed", () => {
    const g = importedReportGame({
      matchId: "7",
      startedAt: NOW,
      durationSec: 1_800,
      heroId: 9,
      side: "dire",
      result: "loss",
      kills: 1,
      deaths: 2,
      assists: 3,
      ranked: true,
      queueClass: "unknown",
      partySize: null,
      patch: null,
      patchCertainty: "unknown",
    });
    expect(g).toMatchObject({ side: "dire", won: false, kills: 1, deaths: 2, assists: 3 });
    expect([g.goldPerMin, g.heroDamage, g.laneRole]).toEqual([null, null, null]);
    expect(g.parsed).toBe(false);
  });
});
