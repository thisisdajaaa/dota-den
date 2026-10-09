import { describe, expect, it, vi } from "vitest";
import { onboardingChecklist, type OnboardingFacts } from "@/modules/onboarding/domain/checklist";
import { OnboardingService } from "@/modules/onboarding/services/onboarding.service";

const now = new Date("2026-10-09T12:00:00Z");
const facts = (over: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  accountCreatedAt: new Date("2026-10-08T12:00:00Z"),
  matches: 0,
  mmrEntries: 0,
  watchedHeroes: 0,
  goalsThisWeek: 0,
  notificationDevices: 0,
  ...over,
});

describe("onboardingChecklist", () => {
  it("ticks each step from the player's data", () => {
    const steps = onboardingChecklist(facts({ matches: 120, mmrEntries: 1 }), now)!;
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["matches", true],
      ["mmr", true],
      ["heroes", false],
      ["goal", false],
      ["notifications", false],
    ]);
    expect(steps.find((s) => s.id === "matches")?.href).toBeNull();
  });

  it("leaves out notifications when the server has none", () => {
    const steps = onboardingChecklist(facts({ notificationDevices: null }), now)!;
    expect(steps.map((s) => s.id)).not.toContain("notifications");
  });

  it("hides once everything is done, and for accounts older than 30 days", () => {
    const all = { matches: 1, mmrEntries: 1, watchedHeroes: 1, goalsThisWeek: 1 };
    expect(onboardingChecklist(facts({ ...all, notificationDevices: 1 }), now)).toBeNull();
    expect(onboardingChecklist(facts({ ...all, notificationDevices: null }), now)).toBeNull();
    const old = facts({ accountCreatedAt: new Date("2026-08-01T00:00:00Z") });
    expect(onboardingChecklist(old, now)).toBeNull();
  });
});

describe("OnboardingService", () => {
  const sources = () => ({
    matches: vi.fn(async () => 10),
    mmrEntries: vi.fn(async () => 0),
    watchedHeroes: vi.fn(async () => 2),
    goalsThisWeek: vi.fn(async () => 0),
    notificationDevices: vi.fn(async (): Promise<number | null> => {
      throw new Error("db");
    }),
  });

  it("skips every lookup for old accounts", async () => {
    const s = sources();
    const svc = new OnboardingService({ sources: s, now: () => now });
    const owner = { userId: "u", accountId32: 1, createdAt: new Date("2026-01-01T00:00:00Z") };
    expect(await svc.checklist(owner, "Asia/Manila")).toBeNull();
    expect(s.matches).not.toHaveBeenCalled();
  });

  it("drops the notifications step when its lookup fails", async () => {
    const svc = new OnboardingService({ sources: sources(), now: () => now });
    const owner = { userId: "u", accountId32: 1, createdAt: new Date("2026-10-08T00:00:00Z") };
    const steps = await svc.checklist(owner, "Asia/Manila");
    expect(steps?.map((s) => [s.id, s.done])).toEqual([
      ["matches", true],
      ["mmr", false],
      ["heroes", true],
      ["goal", false],
    ]);
  });
});
