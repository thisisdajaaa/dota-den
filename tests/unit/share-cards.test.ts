import { describe, expect, it, vi } from "vitest";
import { MESSAGES, englishMessages } from "@/common/i18n/messages";
import { LOCALES } from "@/common/i18n/locales";
import { translator } from "@/common/i18n/translate";
import {
  isEmpty,
  toMatchShare,
  toStreakShare,
  type MatchShare,
  type SessionShare,
  type StreakGameIn,
  type WeekShare,
} from "@/modules/shares/domain/share";
import {
  cardMoment,
  cardTone,
  compactNumber,
  facebookShareUrl,
  isCardFormat,
  pickStandout,
  recordTier,
  streakTier,
} from "@/modules/shares/domain/share-card";
import type { SharesRepositoryPort } from "@/modules/shares/shares.ports";
import { SharesService } from "@/modules/shares/services/shares.service";
import { shareCardText } from "@/modules/shares/ui/share-card-text";
import { cardHeroIds } from "@/modules/shares/ui/share-card-image";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 12);

/** Games oldest first: "W" / "L" per game, one an hour. */
const games = (results: string, heroIds: number[] = [1]): StreakGameIn[] =>
  [...results].map((r, i) => ({
    matchId: String(8_000_000_000 + i),
    startedAt: new Date(T0 + i * 3_600_000),
    heroId: heroIds[i % heroIds.length],
    result: r === "W" ? "win" : "loss",
    kills: 10,
    deaths: 2,
    assists: 8,
  }));

const match = (over: Partial<MatchShare> = {}): MatchShare => ({
  kind: "match",
  matchId: "8000000001",
  startedAt: new Date(T0),
  durationSec: 40 * 60,
  heroId: 1,
  result: "win",
  games: 1,
  wins: 1,
  losses: 0,
  kills: 6,
  deaths: 4,
  assists: 7,
  heroDamage: 20_000,
  goldPerMin: 500,
  lastHits: 200,
  ...over,
});

const session = (wins: number, losses: number): SessionShare => ({
  kind: "session",
  startedAt: new Date(T0),
  endedAt: new Date(T0 + 3 * 3_600_000),
  games: wins + losses,
  wins,
  losses,
  heroes: [{ heroId: 1, games: wins + losses, wins }],
  best: wins > 0 ? { heroId: 1, kills: 12, deaths: 1, assists: 9 } : null,
});

const week = (wins: number, losses: number): WeekShare => ({
  kind: "week",
  from: "2026-11-02",
  to: "2026-11-08",
  games: wins + losses,
  wins,
  losses,
  mostPlayed: { heroId: 14, games: 5, wins: 3 },
  best: { heroId: 1, games: 3, wins: 3 },
});

describe("current win streak", () => {
  it("counts the wins in a row up to the newest game, whatever order games come in", () => {
    const streak = toStreakShare(games("WLWWWW", [1, 1, 14, 1, 14, 1]).reverse());
    expect(streak?.share).toMatchObject({ kind: "streak", games: 4, wins: 4, losses: 0 });
    // The link belongs to the streak's first game, so a growing streak keeps its link.
    expect(streak?.ref).toBe("8000000002");
    expect(streak?.share.from).toEqual(new Date(T0 + 2 * 3_600_000));
    expect(streak?.share.to).toEqual(new Date(T0 + 5 * 3_600_000));
    expect(streak?.share.heroes).toEqual([
      { heroId: 1, games: 2, wins: 2 },
      { heroId: 14, games: 2, wins: 2 },
    ]);
    expect(streak?.share).toMatchObject({ kills: 40, deaths: 8, assists: 32 });
  });

  it("is nothing after a loss, and too short for a card under 3 wins", () => {
    expect(toStreakShare(games("WWWL"))).toBeNull();
    expect(toStreakShare([])).toBeNull();
    const two = toStreakShare(games("LWW"))!;
    expect(two.share.games).toBe(2);
    expect(isEmpty(two.share)).toBe(true);
    expect(isEmpty(toStreakShare(games("WWW"))!.share)).toBe(false);
  });
});

describe("match share", () => {
  it("copies only the owner's own line, with the result from their side", () => {
    const share = toMatchShare({
      match: {
        matchId: "8000000009",
        startedAt: new Date(T0),
        durationSec: 2400,
        radiantWin: false,
      },
      me: {
        side: "dire",
        heroId: 14,
        kills: 3,
        deaths: 1,
        assists: 20,
        heroDamage: null,
        goldPerMin: 0,
        lastHits: 40,
        // Anything else on the player's line (names, party, rank) must not come along.
        ...({ personaName: "Someone", partySize: 2, rankTier: 55 } as object),
      },
    });
    expect(share).toEqual({
      kind: "match",
      matchId: "8000000009",
      startedAt: new Date(T0),
      durationSec: 2400,
      heroId: 14,
      result: "win",
      games: 1,
      wins: 1,
      losses: 0,
      kills: 3,
      deaths: 1,
      assists: 20,
      // Not reported upstream: unknown, never zero or guessed.
      heroDamage: null,
      goldPerMin: null,
      lastHits: 40,
    });
  });
});

describe("picking the moment", () => {
  it("names streaks by length", () => {
    expect([3, 4, 5, 6, 7, 12].map(streakTier)).toEqual([
      "roll",
      "roll",
      "hot",
      "hot",
      "legendary",
      "legendary",
    ]);
  });

  it("reads a record as flawless, good, even or tough", () => {
    expect(recordTier({ wins: 4, losses: 0 })).toBe("flawless");
    // Two straight wins aren't "flawless" yet.
    expect(recordTier({ wins: 2, losses: 0 })).toBe("good");
    expect(recordTier({ wins: 5, losses: 2 })).toBe("good");
    expect(recordTier({ wins: 3, losses: 3 })).toBe("even");
    expect(recordTier({ wins: 1, losses: 4 })).toBe("tough");
  });

  it("leads a game's card with its most impressive stat, if any clears its bar", () => {
    expect(pickStandout(match())).toBe("none");
    expect(pickStandout(match({ kills: 18 }))).toBe("kills");
    expect(pickStandout(match({ kills: 8, deaths: 1, assists: 20 }))).toBe("kda");
    // 54k in 40 minutes is 1,350 a minute (1.5× the bar) beats 15 kills (1×).
    expect(pickStandout(match({ kills: 15, heroDamage: 54_000 }))).toBe("damage");
    expect(pickStandout(match({ goldPerMin: 820 }))).toBe("gpm");
    // A stat the upstream didn't report never wins.
    expect(pickStandout(match({ heroDamage: null, goldPerMin: null }))).toBe("none");
    // Zero deaths counts as one.
    expect(pickStandout(match({ kills: 2, deaths: 0, assists: 4 }))).toBe("kda");
  });

  it("maps every snapshot to a moment and a tone", () => {
    expect(cardMoment(session(5, 0))).toEqual({ kind: "session", tier: "flawless" });
    expect(cardTone(cardMoment(session(1, 3)))).toBe("loss");
    expect(cardTone(cardMoment(week(3, 3)))).toBe("gold");
    expect(cardTone(cardMoment(match({ result: "loss", wins: 0, losses: 1 })))).toBe("loss");
    expect(cardMoment(toStreakShare(games("WWWWWWW"))!.share)).toEqual({
      kind: "streak",
      tier: "legendary",
    });
  });

  it("keeps card numbers short and formats safe", () => {
    expect(compactNumber(9_876)).toBe("9,876");
    expect(compactNumber(45_210)).toBe("45.2k");
    expect(compactNumber(30_000)).toBe("30k");
    expect(isCardFormat("square")).toBe(true);
    expect(isCardFormat("huge")).toBe(false);
    expect(cardHeroIds(week(3, 1))).toEqual([14, 1]);
    expect(cardHeroIds(match())).toEqual([]);
  });
});

describe("card copy per language", () => {
  const t = (locale: (typeof LOCALES)[number]) => translator(MESSAGES[locale], englishMessages);
  const opts = { playerName: "DAJA", heroName: (id: number) => (id === 1 ? "Anti-Mage" : "Pudge") };
  const seven = toStreakShare(games("WWWWWWW"))!.share;

  it("cheers a 7-game streak in each language", () => {
    expect(shareCardText(t("en"), seven, opts).headline).toBe("7-game win streak. Unstoppable!");
    expect(shareCardText(t("fil"), seven, opts).headline).toBe(
      "7-game win streak! Walang makapigil!",
    );
    expect(shareCardText(t("ceb"), seven, opts).headline).toBe(
      "7-game win streak! Walay makapugong!",
    );
    const five = toStreakShare(games("WWWWW"))!.share;
    expect(shareCardText(t("fil"), five, opts).headline).toBe("Grabe, 5-game win streak!");
    expect(shareCardText(t("ceb"), five, opts).headline).toBe("Grabe, 5-game win streak!");
    // The page title gets the fire; the image draws its own flame.
    expect(shareCardText(t("en"), five, opts).title).toBe("DAJA: 5-game win streak! 🔥");
  });

  it("recaps a session with its best game", () => {
    const en = shareCardText(t("en"), session(5, 2), opts);
    expect(en.kicker).toBe("Session recap");
    expect(en.headline).toBe("Good session: 5W–2L");
    expect(en.sub).toBe("Best game: Anti-Mage 12/1/9");
    expect(shareCardText(t("fil"), session(5, 2), opts).headline).toBe("Panalo ang session: 5W–2L");
    expect(shareCardText(t("ceb"), session(4, 0), opts).headline).toBe(
      "Walay pildi! 4–0 karong session",
    );
    expect(shareCardText(t("fil"), session(1, 4), opts).headline).toBe("Bawi next time: 1W–4L");
    expect(en.stats).toEqual([
      { label: "Games", value: "7" },
      { label: "Win rate", value: "71%", tone: "win" },
    ]);
  });

  it("leads a game with its standout stat, and only reported stats", () => {
    const big = match({ heroDamage: 54_321, kills: 9 });
    expect(shareCardText(t("en"), big, opts).headline).toBe("54.3k hero damage on Anti-Mage!");
    expect(shareCardText(t("fil"), big, opts).headline).toBe(
      "54.3k hero damage gamit si Anti-Mage. Halimaw!",
    );
    expect(shareCardText(t("ceb"), big, opts).headline).toBe(
      "54.3k hero damage gamit si Anti-Mage. Kusog kaayo!",
    );
    const quiet = match({ result: "loss", wins: 0, losses: 1, heroDamage: null, goldPerMin: null });
    const ceb = shareCardText(t("ceb"), quiet, opts);
    expect(ceb.headline).toBe("Nakig-away hangtod sa katapusan gamit si Anti-Mage");
    expect(ceb.sub).toBe("Pildi · 6/4/7 · 40:00");
    expect(ceb.stats.map((s) => s.label)).toEqual(["KDA", "Last hits"]);
  });

  it("recaps a week in each language", () => {
    expect(shareCardText(t("en"), week(6, 2), opts).headline).toBe("Great week: 6W–2L");
    expect(shareCardText(t("fil"), week(6, 2), opts).headline).toBe("Ganda ng linggo: 6W–2L");
    expect(shareCardText(t("ceb"), week(6, 2), opts).headline).toBe("Nindot nga semana: 6W–2L");
    expect(shareCardText(t("ceb"), week(6, 2), opts).sub).toBe(
      "Labing maayo nga hero: Anti-Mage (3W 0L)",
    );
  });

  it("has every card message in every language (no English fallback on a card)", () => {
    const leaves = (o: unknown, p = ""): string[] =>
      typeof o === "string"
        ? [p]
        : Object.entries(o as object).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k));
    const en = leaves(englishMessages.shares.card).sort();
    for (const locale of LOCALES) expect(leaves(MESSAGES[locale].shares.card).sort()).toEqual(en);
  });
});

describe("sharing a streak or a game", () => {
  const owner = { userId: "u1", accountId32: 1 };
  const upsert = vi.fn(async (input, slug: string, now: Date) => ({
    ...input,
    _id: slug,
    createdAt: now,
    updatedAt: now,
  }));
  const service = (streak: ReturnType<typeof toStreakShare>, mine: MatchShare | null) =>
    new SharesService({
      repository: { upsert } as unknown as SharesRepositoryPort,
      newSlug: () => "AAAAAAAAAAAA",
      now: () => new Date(T0 + DAY),
      sources: {
        session: async () => null,
        week: async () => week(0, 0),
        journey: async () => {
          throw new Error("unused");
        },
        streak: async () => streak,
        match: async (_o, id) => (id === mine?.matchId ? mine : null),
        playerName: async () => "DAJA",
      },
    });

  it("shares a streak of 3 or more under its first game", async () => {
    const svc = service(toStreakShare(games("LWWWW")), null);
    const res = await svc.share(owner, { kind: "streak" }, "UTC");
    expect(res.ok && res.value).toMatchObject({ kind: "streak", ref: "8000000001" });
    expect(await svc.currentStreak(owner)).toBe(4);
  });

  it("refuses a streak that's too short or missing", async () => {
    for (const streak of [toStreakShare(games("WW")), null]) {
      const svc = service(streak, null);
      expect(await svc.share(owner, { kind: "streak" }, "UTC")).toEqual({
        ok: false,
        error: { type: "empty" },
      });
      expect(await svc.currentStreak(owner)).toBeNull();
    }
  });

  it("shares only games the owner played", async () => {
    const svc = service(null, match());
    const res = await svc.share(owner, { kind: "match", ref: "8000000001" }, "UTC");
    expect(res.ok && res.value).toMatchObject({ kind: "match", ref: "8000000001" });
    expect(await svc.share(owner, { kind: "match", ref: "123" }, "UTC")).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
  });
});

describe("Facebook sharing", () => {
  it("uses the sharer URL with the encoded link (no SDK)", () => {
    expect(facebookShareUrl("https://dota-den.com/s/AAAAAAAAAAAA?lang=fil")).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fdota-den.com%2Fs%2FAAAAAAAAAAAA%3Flang%3Dfil",
    );
  });
});
