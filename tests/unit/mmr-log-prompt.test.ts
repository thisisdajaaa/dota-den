import { describe, expect, it } from "vitest";
import { logPrompt } from "@/modules/mmr/domain/log-prompt";

const at = (h: number) => new Date(Date.UTC(2026, 8, 30, h));
const game = (id: string, h: number) => ({ matchId: id, startedAt: at(h) });

describe("logPrompt", () => {
  it("asks after one ranked game, and says the change would be exact", () => {
    expect(logPrompt({ mmr: 5_000, observedAt: at(10) }, [game("a", 9), game("b", 11)])).toEqual({
      gamesSince: 1,
      newestGameId: "b",
      last: { mmr: 5_000, observedAt: at(10) },
      exactIfLoggedNow: true,
    });
  });

  it("counts several games since the last entry (a total, not per game)", () => {
    const p = logPrompt({ mmr: 5_000, observedAt: at(10) }, [
      game("b", 11),
      game("c", 13),
      game("d", 12),
    ]);
    expect(p).toMatchObject({ gamesSince: 3, newestGameId: "c", exactIfLoggedNow: false });
  });

  it("doesn't ask when nothing was played since, and invites a first entry otherwise", () => {
    expect(logPrompt({ mmr: 5_000, observedAt: at(12) }, [game("a", 11)])).toBeNull();
    expect(logPrompt(null, [])).toBeNull();
    expect(logPrompt(null, [game("a", 11)])).toMatchObject({
      gamesSince: 1,
      last: null,
      exactIfLoggedNow: false,
    });
  });
});
