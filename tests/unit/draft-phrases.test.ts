import { describe, expect, it } from "vitest";
import { englishMessages, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import {
  availableIds,
  describePosition,
  generatePuzzle,
  gradeAnswer,
} from "@/modules/drafts/domain/challenges";
import { compositionFeedback } from "@/modules/drafts/domain/composition-feedback";
import { draftOutlook } from "@/modules/drafts/domain/draft-outlook";
import { compositionChecks, sideReport } from "@/modules/drafts/domain/draft-report";
import {
  proSource,
  proSourcePhrase,
  rankCandidates,
  type HeroMeta,
  type MatchupTable,
  type ProMeta,
  type ScoringHero,
} from "@/modules/drafts/domain/draft-scoring";
import { say } from "@/modules/drafts/ui/i18n";

/**
 * Domain text comes in two forms: English (for the language model) and phrases (for the UI).
 * In English, the translated phrases must read exactly like the English text.
 */
const t = translator<Messages>(englishMessages, englishMessages);

const meta = (entries: Record<number, number>): Map<number, HeroMeta> =>
  new Map(
    Object.entries(entries).map(([id, rate]) => [
      Number(id),
      { games: 100_000, wins: Math.round(100_000 * rate) },
    ]),
  );

describe("draft phrases read like the English text", () => {
  it("composition feedback", () => {
    const heroes = [
      { id: 1, name: "Lion", roles: ["Support", "Disabler", "Nuker"] },
      { id: 2, name: "Axe", roles: ["Initiator", "Durable", "Disabler"] },
      { id: 3, name: "Juggernaut", roles: ["Carry", "Pusher"] },
    ].map((h, i) => ({
      ...h,
      attackType: (i === 0 ? "Ranged" : "Melee") as "Ranged" | "Melee",
      primaryAttr: "str" as const,
    }));
    for (const team of [heroes, heroes.slice(1), heroes.slice(0, 1)]) {
      for (const f of compositionFeedback(team)) {
        expect(say(t, f.phrase)).toBe(f.reason.replace(/ \(based on \d of 5 picks\)$/, ""));
      }
    }
  });

  it("report card summaries", () => {
    const base = {
      heroes: 5,
      laneEdge: 2.5,
      lanesWithData: 3,
      proLanes: 2,
      counterEdge: -1.2,
      strengthEdge: 0.4,
      positionFit: 0.5,
      offRole: [{ hero: "Axe", position: 1 as const }],
      comboEdge: 1,
      comboPairs: 1,
      composition: compositionChecks([{ name: "Axe", roles: ["Initiator"] }], null),
    };
    for (const e of [
      base,
      { ...base, offRole: [], comboPairs: 3, proLanes: 3 },
      {
        ...base,
        laneEdge: null,
        counterEdge: null,
        strengthEdge: null,
        positionFit: null,
        comboEdge: null,
      },
    ]) {
      for (const c of sideReport(e).criteria) expect(say(t, c.summaryPhrase)).toBe(c.summary);
    }
  });

  it("outlook notes, warnings and tournament source", () => {
    const core = (id: number): ScoringHero => ({ id, name: `Core ${id}`, roles: ["Carry"] });
    const pro: ProMeta = {
      matches: 100,
      days: 21,
      leagues: [
        { name: "PGL Wallachia", matches: 60 },
        { name: "DreamLeague", matches: 40 },
      ],
      heroes: new Map([[1, { picks: 40, bans: 30, wins: 22 }]]),
    };
    const res = draftOutlook({
      radiant: [core(1), core(2), core(3), core(4)],
      dire: [core(5)],
      meta: meta({ 1: 0.56, 2: 0.55, 3: 0.54, 4: 0.53, 5: 0.47 }),
      matchups: new Map(),
      pro,
    });
    expect(res.notes.length).toBeGreaterThan(1);
    expect(res.notePhrases.map((p) => say(t, p))).toEqual(res.notes);
    expect(say(t, res.tournamentsPhrase!)).toBe(res.tournaments);
    expect(say(t, proSourcePhrase({ ...pro, leagues: [] }))).toBe(
      proSource({ ...pro, leagues: [] }),
    );
  });

  it("candidate facts", () => {
    const heroes: ScoringHero[] = [1, 2, 3, 4].map((id) => ({
      id,
      name: `Hero ${id}`,
      roles: id === 4 ? ["Support"] : ["Carry", "Support"],
    }));
    const matchups = new Map<number, MatchupTable>([
      [
        3,
        new Map([
          [1, { games: 500, wins: 200 }],
          [2, { games: 500, wins: 300 }],
        ]),
      ],
    ]);
    for (const action of ["pick", "ban"] as const) {
      const ranked = rankCandidates({
        action,
        available: heroes.slice(0, 2),
        own: action === "pick" ? [heroes[3]] : [heroes[2]],
        enemy: action === "pick" ? [heroes[2]] : [heroes[3]],
        ownPicksLeft: 4,
        enemyPicksLeft: 4,
        meta: meta({ 1: 0.52, 2: 0.48 }),
        matchups,
      });
      for (const c of ranked) expect(c.factPhrases.map((p) => say(t, p))).toEqual(c.facts);
    }
  });

  it("challenge verdicts and positions", () => {
    const catalog: ScoringHero[] = Array.from({ length: 60 }, (_, i) => {
      const id = i + 1;
      const roles =
        id % 3 === 0 ? ["Support", "Disabler"] : id % 5 === 0 ? ["Nuker", "Support"] : ["Carry"];
      return { id, name: `Hero ${id}`, roles };
    });
    const stats = meta(Object.fromEntries(catalog.map((h) => [h.id, 0.45 + (h.id % 10) / 100])));
    for (const type of ["last_pick", "counter_pick", "ban_priority", "first_phase_bans"]) {
      const res = generatePuzzle(type, "seed42", catalog);
      if (!res.ok) throw new Error("no puzzle");
      const puzzle = res.value;
      expect(say(t, describePosition(puzzle, catalog))).toMatch(/\.$/);
      const free = availableIds(puzzle, catalog);
      for (const data of [
        { meta: stats, matchups: new Map() },
        { meta: new Map(), matchups: new Map() },
      ]) {
        for (const id of free.slice(0, 8)) {
          const answer = puzzle.answerCount === 2 ? [id, free.at(-1)!] : [id];
          const graded = gradeAnswer(puzzle, catalog, answer, data);
          for (const c of graded.choices) {
            expect(say(t, c.verdictPhrase)).toBe(c.verdict);
            expect(c.factPhrases.map((p) => say(t, p))).toEqual(c.facts);
          }
        }
      }
    }
  });
});
