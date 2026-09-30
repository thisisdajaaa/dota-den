import { describe, expect, it } from "vitest";
import { adminTotals } from "@/modules/admin/domain/overview";

const now = new Date("2026-09-30T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("adminTotals", () => {
  it("counts sign-ups, activity, imports and public listings", () => {
    expect(
      adminTotals(
        [
          { createdAt: ago(1), lastSeenAt: ago(0.5), matches: 10, profileVisibility: "public" },
          { createdAt: ago(3), lastSeenAt: ago(3), matches: 0, profileVisibility: "private" },
          { createdAt: ago(30), lastSeenAt: null, matches: 5, profileVisibility: "friends" },
        ],
        now,
      ),
    ).toEqual({
      users: 3,
      newThisWeek: 2,
      activeToday: 1,
      activeThisWeek: 2,
      withMatches: 2,
      listedPublicly: 1,
    });
  });
});
