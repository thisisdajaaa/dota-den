import { describe, expect, it, vi } from "vitest";
import { battleReport, periodTotals, type ReportGame } from "@/modules/report/domain/battle-report";
import {
  checkCoachNote,
  coachJobKey,
  coachWeekOf,
  coachWeekRange,
  isFinishedCoachWeek,
  isQStashSafe,
  lastCoachWeek,
  weeklyFacts,
  type CoachNote,
} from "@/modules/report/domain/weekly-coach";
import type { BattleReportView } from "@/modules/report/dtos/responses/battle-report.dto";
import { weeklyCoachPrompt } from "@/modules/report/infrastructure/prompts/weekly-coach.prompt";
import type { StoredCoachNote } from "@/modules/report/report.ports";
import { WeeklyCoachService } from "@/modules/report/services/weekly-coach.service";
import { JobsService } from "@/modules/jobs/services/jobs.service";
import type { JobQueue } from "@/modules/jobs/jobs.ports";

const USER = "a".repeat(24);
const OTHER = "b".repeat(24);
/** Tuesday 2026-11-17, 10:00 in Manila: last week is Monday 2026-11-09 to Sunday 2026-11-15. */
const NOW = new Date("2026-11-17T02:00:00Z");
const WEEK = "2026-11-09";

const game = (i: number, over: Partial<ReportGame> = {}): ReportGame => ({
  matchId: String(1000 + i),
  startedAt: new Date(Date.UTC(2026, 10, 9 + (i % 5), 10 + i)),
  durationSec: 2400,
  heroId: i % 3 === 0 ? 26 : 1,
  side: i % 2 ? "radiant" : "dire",
  won: i % 4 !== 0,
  kills: 8,
  deaths: 6,
  assists: 10,
  goldPerMin: 450,
  xpPerMin: 500,
  lastHits: 150,
  denies: 5,
  heroDamage: 18_000,
  heroHealing: 0,
  towerDamage: 2_000,
  laneRole: 1,
  parsed: true,
  ...over,
});

const games = Array.from({ length: 12 }, (_, i) => game(i));
const view = (n = 12): BattleReportView => ({
  report: battleReport(games.slice(0, n), (d) => d.toISOString().slice(0, 10)),
  from: WEEK,
  to: "2026-11-15",
  mmrExact: null,
  mmrEstimate: 0,
  rankedGames: n,
  previous: { from: "2026-11-02", to: "2026-11-08", totals: periodTotals(games.slice(0, 6)) },
  current: periodTotals(games.slice(0, n)),
  source: "opendota",
});
const names = (id: number) => (id === 26 ? "Lion" : "Anti-Mage");
const factsOf = (v: BattleReportView) =>
  weeklyFacts(
    { report: v.report, current: v.current, previous: v.previous.totals, mmrExact: v.mmrExact },
    names,
  );

describe("coach weeks (Asia/Manila)", () => {
  it("is the last full Monday–Sunday week in Manila time", () => {
    expect(lastCoachWeek(NOW)).toBe(WEEK);
    // Sunday 23:59 in Manila (15:59 UTC): that week isn't over yet.
    expect(lastCoachWeek(new Date("2026-11-15T15:59:00Z"))).toBe("2026-11-02");
    // Monday 00:00 in Manila (Sunday 16:00 UTC): it is, though it's still Sunday in UTC.
    expect(lastCoachWeek(new Date("2026-11-15T16:00:00Z"))).toBe(WEEK);
    // The schedule's tick: Sunday 23:00 UTC is Monday 07:00 in Manila.
    expect(lastCoachWeek(new Date("2026-11-15T23:00:00Z"))).toBe(WEEK);
    // Across a year end.
    expect(lastCoachWeek(new Date("2027-01-04T00:00:00Z"))).toBe("2026-12-28");
  });

  it("only accepts finished weeks, as their Monday", () => {
    expect(isFinishedCoachWeek(WEEK, NOW)).toBe(true);
    expect(isFinishedCoachWeek("2026-11-02", NOW)).toBe(true);
    // This week (still running), a Tuesday, and nonsense.
    expect(isFinishedCoachWeek("2026-11-16", NOW)).toBe(false);
    expect(isFinishedCoachWeek("2026-11-10", NOW)).toBe(false);
    expect(isFinishedCoachWeek("2026-02-30", NOW)).toBe(false);
    expect(isFinishedCoachWeek(20261109, NOW)).toBe(false);
    expect(coachWeekRange(WEEK)).toEqual({
      from: WEEK,
      to: "2026-11-15",
      length: 7,
      preset: null,
    });
    expect(coachWeekOf({ from: WEEK, to: "2026-11-15" })).toBe(WEEK);
    expect(coachWeekOf({ from: WEEK, to: "2026-11-16" })).toBeNull();
    expect(coachWeekOf({ from: "2026-11-10", to: "2026-11-16" })).toBeNull();
  });

  it("dedups jobs with QStash-safe keys (no ':')", () => {
    const key = coachJobKey(USER, WEEK);
    expect(key).toBe(`weekly-coach-${USER}-${WEEK}`);
    expect(isQStashSafe(key)).toBe(true);
    expect(key).not.toContain(":");
    expect(() => coachJobKey("bad:id", WEEK)).toThrow();
  });
});

describe("weeklyFacts", () => {
  it("lists the week's real numbers, compared with the week before", () => {
    const f = factsOf(view())!;
    const get = (k: string) => f.facts.find((x) => x.key === k);
    expect(get("games")?.value).toBe(12);
    expect(get("wins")?.value).toBe(9);
    expect(get("hero1.name")?.value).toBe("Anti-Mage");
    expect(get("prevGames")?.label).toBe("Games in the week before");
    expect(get("daysPlayed")?.value).toBe(5);
    expect(get("mostGamesInADay")?.value).toBe(3);
    expect(get("avgDeaths")?.value).toBe(6);
    // Never an estimate: no MMR fact without an exact journal change.
    expect(get("mmrChange")).toBeUndefined();
  });

  it("covers small weeks and skips empty ones", () => {
    expect(factsOf(view(1))?.games).toBe(1);
    expect(factsOf(view(0))).toBeNull();
  });
});

describe("checkCoachNote (the coach checker rule)", () => {
  const { facts } = factsOf(view())!;
  const note = (over: Partial<CoachNote> = {}): CoachNote => ({
    headline: "A solid week on Anti-Mage",
    paragraphs: ["You won 9 of 12 games. Anti-Mage carried most of them."],
    factKeys: ["wins", "games", "hero1.name"],
    fix: {
      title: "Die less in fights",
      detail: "You died 6 times a game on average. Wait for your team before you jump in.",
      factKeys: ["avgDeaths"],
    },
    ...over,
  });

  it("accepts a grounded note whose fix quotes a cited number", () => {
    const res = checkCoachNote(note(), facts);
    expect(res.ok).toBe(true);
  });

  it("rejects numbers the facts don't back, anywhere", () => {
    const res = checkCoachNote(
      note({ paragraphs: ["You won 9 of 12 games, about 70% of them on Radiant."] }),
      facts,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.join(" ")).toMatch(/70/);
  });

  it("needs a fix tied to the player's own numbers", () => {
    const vague = checkCoachNote(
      note({
        fix: { title: "Play safer", detail: "Wait for your team.", factKeys: ["avgDeaths"] },
      }),
      facts,
    );
    expect(vague.ok).toBe(false);
    if (!vague.ok) expect(vague.error.join(" ")).toMatch(/Tie the fix/);
    // A number from a fact the fix doesn't cite.
    const uncited = checkCoachNote(
      note({
        fix: {
          title: "Play safer",
          detail: "You lost 3 games. Wait for your team.",
          factKeys: ["avgDeaths"],
        },
      }),
      facts,
    );
    expect(uncited.ok).toBe(false);
    const noCite = checkCoachNote(
      note({ fix: { title: "Die less", detail: "You died 6 times a game.", factKeys: ["nope"] } }),
      facts,
    );
    expect(noCite.ok).toBe(false);
  });

  it("keeps the shape: 1–3 paragraphs and cited facts", () => {
    expect(
      checkCoachNote(note({ paragraphs: ["a b c", "d e f", "g h i", "j k l"] }), facts).ok,
    ).toBe(false);
    expect(checkCoachNote(note({ factKeys: [] }), facts).ok).toBe(false);
  });

  it("keeps fact keys out of the text the player reads", () => {
    const res = checkCoachNote(
      note({ paragraphs: ["You won 9 of 12 games (wins, hero1.games) on Anti-Mage."] }),
      facts,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.join(" ")).toMatch(/fact keys.*hero1\.games/);
  });
});

describe("weeklyCoachPrompt", () => {
  const { facts } = factsOf(view())!;
  const input = { week: WEEK, facts, smallWeek: false };

  it("gives the model only the facts, and asks for one fix", () => {
    const { system, user } = weeklyCoachPrompt(input, { locale: "en" });
    expect(user).toMatch(/^TASK: weekly-coach$/m);
    expect(user).toMatch(/^LANGUAGE: en \(English\)\.$/m);
    expect(user).toContain("games | Games played: 12");
    expect(user).toContain("avgDeaths | Average deaths per game: 6");
    expect(system).toMatch(/exactly ONE fix/);
    expect(system).toMatch(/every number you write must be a value from FACTS/);
    expect(system).toMatch(/no jargon/);
    expect(system).not.toMatch(/small week/);
  });

  it("asks for natural Taglish in Filipino and Bisaya (not Tagalog) in Cebuano", () => {
    const fil = weeklyCoachPrompt(input, { locale: "fil" });
    expect(fil.user).toMatch(/^LANGUAGE: fil \(Filipino \(Taglish\)\)\.$/m);
    expect(fil.system).toMatch(/Taglish/);
    expect(fil.system).toMatch(/never translate word for word/);
    const ceb = weeklyCoachPrompt(input, { locale: "ceb" });
    expect(ceb.user).toMatch(/^LANGUAGE: ceb \(Cebuano \(Bisaya\)\)\.$/m);
    expect(ceb.system).toMatch(/Bisaya/);
    expect(ceb.system).toMatch(/Do not write Tagalog words/);
    // The tone examples carry no numbers the model could copy.
    for (const p of [fil, ceb])
      for (const example of p.system.split("Example of the tone").slice(1))
        expect(example.slice(0, 180)).not.toMatch(/\d/);
  });

  it("flags small weeks and sends the checker's problems back on a retry", () => {
    const { system, user } = weeklyCoachPrompt(
      { ...input, smallWeek: true },
      { locale: "en", problems: ["The note uses numbers that are not in FACTS: 70."] },
    );
    expect(system).toMatch(/small week/);
    expect(user).toContain("- The note uses numbers that are not in FACTS: 70.");
  });
});

describe("WeeklyCoachService", () => {
  const goodAnswer = {
    headline: "A solid week on Anti-Mage",
    paragraphs: ["You won 9 of 12 games. Anti-Mage did most of the work."],
    facts: ["wins", "games", "hero1.name"],
    fix: {
      title: "Die less in fights",
      detail: "You died 6 times a game on average. Wait for your team before you jump in.",
      facts: ["avgDeaths"],
    },
  };

  function setup(over: Partial<ConstructorParameters<typeof WeeklyCoachService>[0]> = {}) {
    const saved = new Map<string, StoredCoachNote>();
    const write = vi.fn(async () => ({ ok: true as const, value: goodAnswer as unknown }));
    const enqueue = vi.fn(async () => {});
    const notify = vi.fn(async () => 1);
    const used = vi.fn(async () => {});
    const report = vi.fn(async () => view());
    const svc = new WeeklyCoachService({
      writer: { model: "m", write },
      notes: {
        get: async (id) => saved.get(id) ?? null,
        saveOnce: async (n) => {
          if (!saved.has(n.id)) saved.set(n.id, n);
          return saved.get(n.id)!;
        },
        exportForOwner: async () => [],
        deleteForOwner: async () => 0,
      },
      isPlus: async () => true,
      plusUserIds: async () => [USER, OTHER],
      wants: async () => true,
      user: async () => ({ accountId32: 123, locale: "fil" }),
      report,
      enqueue,
      notify,
      budget: { take: async () => true },
      heroName: async (id) => names(id),
      used,
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => NOW,
      ...over,
    });
    return { svc, write, saved, enqueue, notify, used, report };
  }

  it("writes a checked note once per player and week, in the player's language", async () => {
    const { svc, write, saved, used, report } = setup();
    const first = await svc.write({ id: USER, accountId32: 123 }, WEEK, "ceb");
    expect(first.status).toBe("written");
    expect(report).toHaveBeenCalledWith(
      { userId: USER, accountId32: 123 },
      coachWeekRange(WEEK),
      "Asia/Manila",
    );
    expect((write.mock.calls[0] as unknown[])[1]).toMatchObject({ locale: "ceb" });
    expect(saved.get(`${USER}-${WEEK}`)?.locale).toBe("ceb");
    const again = await svc.write({ id: USER, accountId32: 123 }, WEEK, "en");
    expect(again.status).toBe("cached");
    expect(write).toHaveBeenCalledTimes(1);
    expect(used).toHaveBeenCalledTimes(1);
  });

  it("retries once with the checker's problems, then gives up", async () => {
    const bad = { ...goodAnswer, paragraphs: ["You won 99 games this week, great job."] };
    const write = vi.fn(async () => ({ ok: true as const, value: bad as unknown }));
    const { svc, saved } = setup({ writer: { model: "m", write } });
    await expect(svc.write({ id: USER, accountId32: 123 }, WEEK, "en")).rejects.toMatchObject({
      details: { reason: "failed" },
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect((write.mock.calls[1] as unknown[])[1]).toMatchObject({
      problems: expect.arrayContaining([expect.stringMatching(/99/)]),
    });
    expect(saved.size).toBe(0);
  });

  it("skips weeks without games (no model call) and unfinished weeks", async () => {
    const { svc, write } = setup({ report: async () => view(0) });
    expect(await svc.write({ id: USER, accountId32: 123 }, WEEK, "en")).toEqual({
      status: "no_games",
    });
    expect(write).not.toHaveBeenCalled();
    await expect(
      svc.write({ id: USER, accountId32: 123 }, "2026-11-16", "en"),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("is Plus only: free players get a preview state, never a note", async () => {
    const free = setup({ isPlus: async () => false });
    expect(await free.svc.view({ id: USER })).toEqual({ status: "not_plus", week: WEEK });
    await expect(free.svc.write({ id: USER, accountId32: 123 }, WEEK, "en")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(free.write).not.toHaveBeenCalled();
    const plus = setup();
    expect(await plus.svc.view({ id: USER })).toEqual({ status: "available", week: WEEK });
    await plus.svc.write({ id: USER, accountId32: 123 }, WEEK, "en");
    expect(await plus.svc.view({ id: USER }, WEEK)).toMatchObject({ status: "ready" });
    // A week that isn't finished falls back to last week.
    expect(await plus.svc.view({ id: USER }, "2026-11-16")).toMatchObject({ status: "ready" });
    expect(await setup({ writer: null }).svc.view({ id: USER })).toEqual({ status: "off" });
  });

  it("the Monday tick queues one job per Plus player who wants the note", async () => {
    const { svc, enqueue } = setup({ wants: async (id) => id === USER });
    expect(await svc.runSchedule()).toEqual({ week: WEEK, players: 2, queued: 1 });
    expect(enqueue).toHaveBeenCalledWith({ userId: USER, week: WEEK });
    expect(await setup({ writer: null }).svc.runSchedule()).toMatchObject({ off: true, queued: 0 });
    // A failed publish (e.g. QStash refusing a message) doesn't stop the other players.
    const flaky = setup({
      enqueue: vi.fn(async (job: { userId: string }) => {
        if (job.userId === USER) throw new Error("400");
      }),
    });
    expect(await flaky.svc.runSchedule()).toEqual({ week: WEEK, players: 2, queued: 1, failed: 1 });
  });

  it("a note job writes the note and pushes it, and a repeat writes nothing new", async () => {
    const { svc, write, notify } = setup();
    expect(await svc.runOne({ userId: USER, week: WEEK })).toBe("written");
    expect(notify).toHaveBeenCalledWith(USER, {
      week: WEEK,
      headline: goodAnswer.headline,
      fix: goodAnswer.fix.title,
    });
    // A duplicate delivery: no model call (the push itself is sent once per week by kind and key).
    expect(await svc.runOne({ userId: USER, week: WEEK })).toBe("already_written");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a note job checks Plus, the setting and the week when it runs", async () => {
    expect(
      await setup({ isPlus: async () => false }).svc.runOne({ userId: USER, week: WEEK }),
    ).toBe("not_plus");
    expect(await setup({ wants: async () => false }).svc.runOne({ userId: USER, week: WEEK })).toBe(
      "turned_off",
    );
    expect(await setup().svc.runOne({ userId: USER, week: "2026-11-16" })).toBe("invalid");
    expect(await setup().svc.runOne({ userId: "x:y", week: WEEK })).toBe("invalid");
    // Old news: a note job for a week long gone.
    expect(await setup().svc.runOne({ userId: USER, week: "2026-10-26" })).toBe("invalid");
    const none = setup({ report: async () => view(0) });
    expect(await none.svc.runOne({ userId: USER, week: WEEK })).toBe("no_games");
    expect(none.notify).not.toHaveBeenCalled();
    expect(
      await setup({ budget: { take: async () => false } }).svc.runOne({ userId: USER, week: WEEK }),
    ).toBe("budget_spent");
  });

  it("a note job throws (so the queue retries) when games or the model can't be read", async () => {
    await expect(
      setup({ report: async () => null }).svc.runOne({ userId: USER, week: WEEK }),
    ).rejects.toMatchObject({ details: { reason: "games_unavailable" } });
    const down = vi.fn(async () => ({
      ok: false as const,
      error: { type: "unavailable" as const, cause: "timeout" },
    }));
    await expect(
      setup({ writer: { model: "m", write: down } }).svc.runOne({ userId: USER, week: WEEK }),
    ).rejects.toMatchObject({ details: { reason: "unavailable" } });
  });
});

describe("JobsService: weekly coach jobs", () => {
  it("queues a note job per player and week with a QStash-safe dedup key", async () => {
    const enqueue = vi.fn(async () => "queued" as const);
    const queue: JobQueue = { durable: true, enqueue };
    const schedule = vi.fn(async () => ({ queued: 1 }));
    const note = vi.fn(async () => "written");
    const jobs = new JobsService({
      queue: () => queue,
      matches: { sync: vi.fn(), syncDue: vi.fn() } as never,
      backfillCooldownMs: 1,
      warmDraftData: async () => [],
      warmMeta: async () => [],
      weeklyCoach: { schedule, note },
      logger: { info: vi.fn() },
    });
    await jobs.enqueueWeeklyCoachNote({ userId: USER, week: WEEK });
    expect(enqueue).toHaveBeenCalledWith(
      "weekly-coach-note",
      { userId: USER, week: WEEK },
      { dedupKey: `weekly-coach-${USER}-${WEEK}` },
    );
    const handlers = jobs.handlers();
    await handlers["weekly-coach"]({});
    await handlers["weekly-coach-note"]({ userId: USER, week: WEEK });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenCalledWith({ userId: USER, week: WEEK });
  });
});
