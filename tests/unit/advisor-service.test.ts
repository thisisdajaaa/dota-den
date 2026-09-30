import { describe, expect, it } from "vitest";
import { AdvisorService, type AdvisorSources } from "@/modules/advisor/application/advisor-service";

const sources = (over: Partial<AdvisorSources> = {}): AdvisorSources => ({
  poolRows: async () => [
    { heroId: 90, games: 0, wins: 0, againstGames: 40, againstWins: 10 },
    { heroId: 10, games: 30, wins: 15, againstGames: 0, againstWins: 0 },
  ],
  matchups: async (id) => (id === 12 ? new Map([[90, { games: 300, wins: 190 }]]) : new Map()),
  role: async () => 2,
  candidates: async () =>
    [10, 11, 12, 13].map((heroId) => ({
      heroId,
      highRank: { rate: 0.52, games: 5_000 },
      contestRate: null,
    })),
  ...over,
});

describe("AdvisorService", () => {
  it("suggests heroes for your role, leading with a counter to your nemesis", async () => {
    const view = await new AdvisorService(sources()).poolAdvice(1);
    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.position).toBe(2);
    expect(view.nemeses.map((n) => n.heroId)).toEqual([90]);
    expect(view.advice.map((a) => a.heroId)).toEqual([12, 11, 13]);
  });

  it("explains when your role is unclear or data is missing", async () => {
    expect(
      (await new AdvisorService(sources({ role: async () => null })).poolAdvice(1)).status,
    ).toBe("no_role");
    expect(
      (await new AdvisorService(sources({ candidates: async () => null })).poolAdvice(1)).status,
    ).toBe("unavailable");
  });
});
