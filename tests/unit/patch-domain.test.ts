import { describe, expect, it } from "vitest";
import {
  changesAffectingPool,
  changesAffectingWatchlist,
  cleanNoteText,
  diffSummary,
  EMPTY_SECTIONS,
  resolveReferences,
  type PatchNote,
  type PatchSections,
} from "@/modules/patches/domain/patch";
import { checkWatchlistLimits, normalizeIds } from "@/modules/patches/domain/watchlist";

const note = (text: string, extra: Partial<PatchNote> = {}): PatchNote => ({
  text,
  indentLevel: 1,
  info: null,
  aghanims: null,
  icon: null,
  subtitle: false,
  bullet: true,
  ...extra,
});

const hero = (heroId: number, abilityIds: number[] = []) => ({
  heroId,
  heroNotes: [note("Base Armor increased by 1")],
  talentNotes: [],
  abilities: abilityIds.map((abilityId) => ({
    abilityId,
    abilityKey: null,
    abilityName: null,
    iconPath: null,
    notes: [note("Cooldown reduced")],
  })),
});

const item = (itemId: number | null, notes = [note("Cost reduced")]) => ({
  itemId,
  itemKey: null,
  itemName: null,
  iconPath: null,
  title: itemId === null ? "Basic Items" : null,
  isGeneralNote: itemId === null,
  notes,
});

const sections: PatchSections = {
  general: [{ title: "Map", notes: [note("Tormentor", { subtitle: true }), note("Moved")] }],
  items: [item(null, []), item(1), item(36)],
  neutralItems: [item(1596)],
  heroes: [hero(1, [5003]), hero(14, [5075, 5076]), hero(99)],
  neutralCreeps: [{ key: "npc_x", name: "Kobold", notes: [note("Damage increased")] }],
};

describe("cleanNoteText", () => {
  it("turns <br> into line breaks and drops presentational tags without changing words", () => {
    expect(cleanNoteText("A<br>B<br/>C<BR />D")).toBe("A\nB\nC\nD");
    expect(
      cleanNoteText("<font color='#e03e2e'>Intelligence Penalty</font> increased from 5%"),
    ).toBe("Intelligence Penalty increased from 5%");
    expect(cleanNoteText('<span class="New">New Miscellaneous Item</span>')).toBe(
      "New Miscellaneous Item",
    );
    expect(cleanNoteText("Health Restoration ")).toBe("Health Restoration");
  });

  it("keeps comparison signs, decodes basic entities and blanks spacer lines", () => {
    expect(cleanNoteText("Deals 5 < 10 & more")).toBe("Deals 5 < 10 & more");
    expect(cleanNoteText("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
    expect(cleanNoteText("<br>")).toBe("");
  });

  it("neutralizes script-like markup to inert text", () => {
    expect(cleanNoteText('<script>alert("x")</script>Hi')).toBe('alert("x")Hi');
    expect(cleanNoteText('<img src=x onerror="y">ok')).toBe("ok");
  });
});

describe("diffSummary", () => {
  it("counts changed entries, ignoring headings and subtitles", () => {
    expect(diffSummary({ sections })).toEqual({
      generalNotes: 1,
      heroesChanged: 3,
      heroAbilitiesChanged: 3,
      itemsChanged: 2,
      neutralItemsChanged: 1,
      neutralCreepsChanged: 1,
    });
    expect(diffSummary({ sections: EMPTY_SECTIONS })).toEqual({
      generalNotes: 0,
      heroesChanged: 0,
      heroAbilitiesChanged: 0,
      itemsChanged: 0,
      neutralItemsChanged: 0,
      neutralCreepsChanged: 0,
    });
  });
});

describe("changesAffectingPool", () => {
  it("returns only the pool's hero entries, in patch order", () => {
    expect(changesAffectingPool({ sections }, [99, 1, 500]).map((h) => h.heroId)).toEqual([1, 99]);
    expect(changesAffectingPool({ sections }, [])).toEqual([]);
  });

  it("matches watched items across regular and neutral items", () => {
    const res = changesAffectingWatchlist({ sections }, { heroIds: [14], itemIds: [36, 1596] });
    expect(res.heroes.map((h) => h.heroId)).toEqual([14]);
    expect(res.items.map((i) => i.itemId)).toEqual([36, 1596]);
  });
});

describe("resolveReferences", () => {
  it("attaches known names and leaves unknown ids as ids", () => {
    const resolved = resolveReferences(sections, {
      abilities: new Map([
        [5003, { key: "antimage_mana_break", name: "Mana Break", iconPath: null }],
      ]),
      items: new Map([[1, { key: "blink", name: "Blink Dagger", iconPath: "/apps/dota2/x.png" }]]),
    });
    expect(resolved.heroes[0].abilities[0]).toMatchObject({
      abilityId: 5003,
      abilityKey: "antimage_mana_break",
      abilityName: "Mana Break",
    });
    expect(resolved.heroes[1].abilities[0]).toMatchObject({
      abilityId: 5075,
      abilityKey: null,
      abilityName: null,
    });
    expect(resolved.items[1]).toMatchObject({ itemId: 1, itemName: "Blink Dagger" });
    expect(resolved.items[2]).toMatchObject({ itemId: 36, itemName: null });
    // Original notes untouched.
    expect(resolved.heroes[0].abilities[0].notes).toEqual(sections.heroes[0].abilities[0].notes);
  });
});

describe("watchlist limits", () => {
  it("normalizes ids", () => {
    expect(normalizeIds([3, 1, 3, -1, 0, 1.5, 2])).toEqual([1, 2, 3]);
  });

  it("rejects more than 50 heroes after deduplication", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(checkWatchlistLimits({ heroIds: [...fifty, 1], itemIds: [] }).ok).toBe(true);
    expect(checkWatchlistLimits({ heroIds: [...fifty, 51], itemIds: [] })).toEqual({
      ok: false,
      error: { type: "too_many_heroes", limit: 50 },
    });
  });
});
