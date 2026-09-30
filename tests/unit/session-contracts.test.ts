import { describe, expect, it } from "vitest";
import {
  SessionGapInputSchema,
  SessionNoteInputSchema,
  toSessionNoteDto,
} from "@/modules/sessions/application/contracts";

describe("SessionNoteInputSchema", () => {
  it("trims text and normalises an empty goal-met choice to null", () => {
    expect(
      SessionNoteInputSchema.parse({ note: "  played calm  ", goal: " farm ", goalMet: "" }),
    ).toEqual({ note: "played calm", goal: "farm", goalMet: null });
  });

  it("treats missing fields as empty and accepts its own output", () => {
    const first = SessionNoteInputSchema.parse({});
    expect(first).toEqual({ note: "", goal: "", goalMet: null });
    const withGoal = SessionNoteInputSchema.parse({ goal: "Ward more", goalMet: "partly" });
    expect(SessionNoteInputSchema.parse(withGoal)).toEqual(withGoal);
  });

  it("enforces the note and goal length limits", () => {
    expect(SessionNoteInputSchema.safeParse({ note: "x".repeat(1000) }).success).toBe(true);
    const longNote = SessionNoteInputSchema.safeParse({ note: "x".repeat(1001) });
    expect(longNote.success).toBe(false);
    expect(longNote.error?.flatten().fieldErrors.note?.[0]).toMatch(/under 1,000/);
    expect(SessionNoteInputSchema.safeParse({ goal: "x".repeat(200) }).success).toBe(true);
    expect(SessionNoteInputSchema.safeParse({ goal: "x".repeat(201) }).success).toBe(false);
  });

  it("only allows yes, no or partly, and only with a goal", () => {
    expect(SessionNoteInputSchema.safeParse({ goal: "g", goalMet: "maybe" }).success).toBe(false);
    const noGoal = SessionNoteInputSchema.safeParse({ goalMet: "yes" });
    expect(noGoal.success).toBe(false);
    expect(noGoal.error?.flatten().fieldErrors.goalMet?.[0]).toMatch(/Set a goal/);
  });

  it("rejects unknown fields and non-string values", () => {
    expect(SessionNoteInputSchema.safeParse({ note: "a", userId: "someone" }).success).toBe(false);
    expect(SessionNoteInputSchema.safeParse({ note: { $ne: "" } }).success).toBe(false);
    expect(SessionNoteInputSchema.safeParse(null).success).toBe(false);
  });

  it("never exposes the owner's user id in the DTO", () => {
    const dto = toSessionNoteDto({
      userId: "secret",
      accountId32: 1,
      sessionId: "1:2",
      matchIds: ["2"],
      sessionStartedAt: new Date("2026-09-01T00:00:00Z"),
      note: "n",
      goal: "g",
      goalMet: "yes",
      updatedAt: new Date("2026-09-02T00:00:00Z"),
    });
    expect(dto).toEqual({
      sessionId: "1:2",
      note: "n",
      goal: "g",
      goalMet: "yes",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
  });
});

describe("SessionGapInputSchema", () => {
  it.each([30, 60, 90, 120, "90"])("accepts %j minutes", (gapMinutes) => {
    expect(SessionGapInputSchema.parse({ gapMinutes })).toEqual({
      gapMinutes: Number(gapMinutes),
    });
  });

  it.each([0, 45, 61, -30, "abc", null])("rejects %j", (gapMinutes) => {
    expect(SessionGapInputSchema.safeParse({ gapMinutes }).success).toBe(false);
  });
});
