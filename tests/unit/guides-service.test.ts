import { describe, expect, it } from "vitest";
import { GuideService } from "@/modules/guides/guides.service";

describe("GuideService.proCoreItems", () => {
  it("ranks pro purchases per phase without consumables; null when the source is down", async () => {
    const source = {
      itemPopularity: async () => ({
        start: {},
        early: {},
        mid: { "1": 50, "2": 90, "3": 10 },
        late: { "4": 5 },
      }),
      benchmarks: async () => null,
      proGames: async () => null,
      proNames: async () => null,
      matchups: async () => null,
    };
    const svc = new GuideService({ source: source as never });
    const items = await svc.proCoreItems(1, (id) => id === 2);
    expect(items?.filter((i) => i.phase === "mid").map((i) => i.itemId)).toEqual([1, 3]);
    const down = new GuideService({
      source: { ...source, itemPopularity: async () => Promise.reject(new Error("503")) } as never,
    });
    expect(await down.proCoreItems(1, () => false)).toBeNull();
  });
});
