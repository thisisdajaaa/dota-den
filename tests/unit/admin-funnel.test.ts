import { describe, expect, it } from "vitest";
import { funnel } from "@/modules/admin/domain/funnel";

const now = new Date("2026-11-25T00:00:00Z");
const user = (id: string, created: string, matches: number, days: string[] | null) => ({
  userId: id,
  createdAt: new Date(`${created}T10:00:00Z`),
  matches,
  activeDays: days,
});

describe("funnel", () => {
  it("counts each step out of everyone who signed in, all time and joined lately", () => {
    const rows = funnel(
      [
        user("a", "2026-09-01", 120, ["2026-09-01", "2026-09-05"]),
        user("b", "2026-11-20", 40, ["2026-11-20"]),
        user("c", "2026-11-21", 0, ["2026-11-21", "2026-11-22"]),
      ],
      { trialed: ["a", "c", "gone"], subscribed: ["a"] },
      now,
    );
    expect(rows).toEqual([
      { step: "signedUp", all: 3, recent: 2 },
      { step: "imported", all: 2, recent: 1 },
      { step: "returned", all: 2, recent: 1 },
      { step: "trialed", all: 2, recent: 1 },
      { step: "subscribed", all: 1, recent: 0 },
    ]);
  });

  it("leaves steps it can't count empty instead of guessing", () => {
    const rows = funnel([user("a", "2026-11-20", 3, null)], null, now);
    expect(rows.map((r) => r.all)).toEqual([1, 1, null, null, null]);
  });
});
