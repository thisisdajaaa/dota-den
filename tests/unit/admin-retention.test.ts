import { describe, expect, it } from "vitest";
import { retention } from "@/modules/admin/domain/retention";

const now = new Date("2026-10-09T12:00:00Z");

describe("retention", () => {
  it("counts active players over 1, 7 and 30 days", () => {
    const r = retention(
      [
        { createdAt: new Date("2026-09-29T10:00:00Z"), activeDays: ["2026-09-29", "2026-10-09"] },
        { createdAt: new Date("2026-09-29T10:00:00Z"), activeDays: ["2026-09-29", "2026-10-04"] },
        { createdAt: new Date("2026-09-01T10:00:00Z"), activeDays: ["2026-09-01"] },
        { createdAt: new Date("2026-09-30T10:00:00Z"), activeDays: [] },
      ],
      now,
    );
    expect(r).toMatchObject({ active1: 1, active7: 2, active30: 2, returning: 2 });
  });

  it("counts a return only on a later day than the sign-up, per sign-up week", () => {
    const r = retention(
      [
        // Same day twice: not a return.
        { createdAt: new Date("2026-09-29T10:00:00Z"), activeDays: ["2026-09-29"] },
        // Back 3 days later.
        { createdAt: new Date("2026-09-30T10:00:00Z"), activeDays: ["2026-09-30", "2026-10-03"] },
        // Back 9 days later: ever, not within 7.
        { createdAt: new Date("2026-10-01T10:00:00Z"), activeDays: ["2026-10-10"] },
        // Next week (Monday 2026-10-05).
        { createdAt: new Date("2026-10-06T10:00:00Z"), activeDays: ["2026-10-06"] },
      ],
      now,
    );
    expect(r.returning).toBe(2);
    expect(r.weeks).toEqual([
      { week: "2026-10-05", signedUp: 1, returnedWithin7: 0, returnedEver: 0 },
      { week: "2026-09-28", signedUp: 3, returnedWithin7: 1, returnedEver: 2 },
    ]);
  });

  it("is empty with no players", () => {
    expect(retention([], now)).toEqual({
      active1: 0,
      active7: 0,
      active30: 0,
      returning: 0,
      weeks: [],
    });
  });
});
