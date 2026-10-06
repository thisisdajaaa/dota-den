import { describe, expect, it } from "vitest";
import { MmrEntryInputSchema } from "@/modules/mmr/schemas/mmr-entry.schema";

describe("MmrEntryInputSchema", () => {
  it("accepts a valid entry and normalises an empty note to null", () => {
    const res = MmrEntryInputSchema.safeParse({
      mmr: "5230",
      observedAt: "2026-09-01T10:00:00Z",
      note: "  ",
    });
    expect(res.success && res.data).toEqual({
      mmr: 5230,
      observedAt: new Date("2026-09-01T10:00:00Z"),
      note: null,
    });
  });

  it.each([undefined, null, ""])("treats a missing or empty note (%j) as no note", (note) => {
    const res = MmrEntryInputSchema.safeParse({
      mmr: 5000,
      observedAt: "2026-09-01T10:00:00Z",
      note,
    });
    expect(res.success && res.data.note).toBeNull();
  });

  it("accepts its own output (what the form sends after parsing)", () => {
    const first = MmrEntryInputSchema.parse({
      mmr: "5000",
      observedAt: "2026-09-01T10:00",
      note: "",
    });
    const wire = JSON.parse(
      JSON.stringify({ ...first, observedAt: first.observedAt.toISOString() }),
    );
    expect(MmrEntryInputSchema.safeParse(wire).success).toBe(true);
  });

  it.each([
    [{ mmr: -1 }, "mmr"],
    [{ mmr: 15_001 }, "mmr"],
    [{ mmr: 50.5 }, "mmr"],
    [{ mmr: "abc" }, "mmr"],
    [{ observedAt: new Date(Date.now() + 3_600_000).toISOString() }, "observedAt"],
    [{ observedAt: "2010-01-01T00:00:00Z" }, "observedAt"],
    [{ note: "x".repeat(281) }, "note"],
  ])("rejects %j", (patch, field) => {
    const res = MmrEntryInputSchema.safeParse({
      mmr: 5000,
      observedAt: "2026-09-01T10:00:00Z",
      ...patch,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(Object.keys(res.error.flatten().fieldErrors)).toContain(field);
  });
});
