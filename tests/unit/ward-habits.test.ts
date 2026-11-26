import { describe, expect, it } from "vitest";
import {
  mapWards,
  MIN_TIMED_OBSERVERS,
  OBSERVER_LIFE_SEC,
  wardHabits,
  type WardGame,
} from "@/modules/heroes/domain/ward-habits";

const obs = (placedAt: number, life: number | null, x = 100, y = 100) => ({
  kind: "observer" as const,
  placedAt,
  removedAt: life === null ? null : placedAt + life,
  x,
  y,
});
const sen = (placedAt: number) => ({
  kind: "sentry" as const,
  placedAt,
  removedAt: null,
  x: 120,
  y: 110,
});
const game = (wards: WardGame["wards"], side: WardGame["side"] = "radiant"): WardGame => ({
  matchId: String(Math.random()),
  heroId: 5,
  side,
  wards,
});

describe("ward habits", () => {
  it("counts wards per game, including games with none", () => {
    const h = wardHabits([game([obs(-30, 360), obs(400, 100), sen(300)]), game([])]);
    expect(h.games).toBe(2);
    expect(h.gamesWarded).toBe(1);
    expect(h.observers).toMatchObject({ placed: 2, perGame: 1, timed: 2 });
    expect(h.sentries).toEqual({ placed: 1, perGame: 0.5 });
  });

  it("says nothing about observer life below the sample floor", () => {
    const h = wardHabits([game([obs(0, 100), obs(60, null)])]);
    expect(h.observers.avgLifeSec).toBeNull();
    expect(h.observers.destroyedShare).toBeNull();
    expect(h.observers.timed).toBe(1);
  });

  it("averages observer life and counts the ones destroyed early", () => {
    const wards = Array.from({ length: MIN_TIMED_OBSERVERS }, (_, i) =>
      // Half lasted their full 6 minutes (or reported a little over), half were killed at 2:00.
      obs(i * 60, i % 2 ? 120 : OBSERVER_LIFE_SEC + 5),
    );
    const h = wardHabits([game(wards)]);
    expect(h.observers.avgLifeSec).toBe((OBSERVER_LIFE_SEC + 120) / 2);
    expect(h.observers.destroyedShare).toBe(0.5);
  });

  it("takes the median first observer time from games that had one", () => {
    const h = wardHabits([game([sen(10), obs(-60, 360)]), game([obs(120, 360)]), game([sen(5)])]);
    expect(h.firstObserverSec).toBe(30);
  });

  it("puts every ward on the map with its side and known life", () => {
    const spots = mapWards([game([obs(10, 30), sen(50)], "dire")]);
    expect(spots).toEqual([
      { kind: "observer", side: "dire", x: 100, y: 100, placedAt: 10, lifeSec: 30 },
      { kind: "sentry", side: "dire", x: 120, y: 110, placedAt: 50, lifeSec: null },
    ]);
  });
});
