/**
 * Normalized official patch notes (spec §2.3). Note text keeps Valve's original wording;
 * only presentational markup is removed (see `cleanNoteText`). Names and icons for
 * abilities/items are references resolved from a catalog and stay null when unknown.
 */
export type ParseStatus = "parsed" | "partial" | "failed";

export interface PatchNote {
  /** Original wording as plain text. `<br>` becomes a newline; other tags are removed. */
  text: string;
  indentLevel: number;
  /** Footnote Valve shows next to the note, cleaned like `text`. */
  info: string | null;
  aghanims: "scepter" | "shard" | null;
  /** Upstream stat icon hint on hero notes (e.g. "armor"), passed through verbatim. */
  icon: string | null;
  /** Valve renders these as sub-headings inside a section. */
  subtitle: boolean;
  /** False when Valve hides the bullet for this line. */
  bullet: boolean;
}

export interface NoteGroup {
  title: string | null;
  notes: PatchNote[];
}

export interface ItemPatchNotes {
  /** Upstream item (ability) id, or null for general notes that head a group of items. */
  itemId: number | null;
  itemKey: string | null;
  itemName: string | null;
  /** Dota CDN path (e.g. "/apps/dota2/images/dota_react/items/blink.png"), when known. */
  iconPath: string | null;
  /** Upstream heading, when present (general notes and new-item callouts). */
  title: string | null;
  isGeneralNote: boolean;
  notes: PatchNote[];
}

export interface AbilityPatchNotes {
  abilityId: number;
  abilityKey: string | null;
  abilityName: string | null;
  iconPath: string | null;
  notes: PatchNote[];
}

export interface HeroPatchNotes {
  heroId: number;
  heroNotes: PatchNote[];
  talentNotes: PatchNote[];
  abilities: AbilityPatchNotes[];
}

export interface NeutralCreepPatchNotes {
  /** Upstream unit key, e.g. "npc_dota_neutral_kobold_taskmaster". */
  key: string;
  name: string;
  notes: PatchNote[];
}

export interface PatchSections {
  general: NoteGroup[];
  items: ItemPatchNotes[];
  neutralItems: ItemPatchNotes[];
  heroes: HeroPatchNotes[];
  neutralCreeps: NeutralCreepPatchNotes[];
}

export interface Patch {
  version: string;
  name: string;
  publishedAt: Date;
  /** Official patch page: the canonical source and attribution link. */
  sourceUrl: string;
  /** Machine-readable feed the content was imported from. */
  feedUrl: string;
  language: "english";
  /** SHA-256 of the canonical upstream JSON; null when nothing could be fetched. */
  contentHash: string | null;
  parseStatus: ParseStatus;
  /** Why the parse is partial or failed. Empty when parsed. */
  parseIssues: string[];
  /** 1 on first import, +1 each time stored content is replaced. */
  parseRevision: number;
  /** Version of the parser that produced `sections`. */
  parserVersion: number;
  /** False when the ability/item catalog was unavailable at import time. */
  referencesResolved: boolean;
  fetchedAt: Date;
  sections: PatchSections;
}

export const EMPTY_SECTIONS: PatchSections = {
  general: [],
  items: [],
  neutralItems: [],
  heroes: [],
  neutralCreeps: [],
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Upstream notes contain light HTML (`<br>`, `<span class="…">`, `<font color>`). Convert
 * line breaks, drop tags (keeping their inner text) and decode basic entities. The words
 * themselves are never changed.
 */
export function cleanNoteText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export interface PatchDiffSummary {
  generalNotes: number;
  heroesChanged: number;
  heroAbilitiesChanged: number;
  itemsChanged: number;
  neutralItemsChanged: number;
  neutralCreepsChanged: number;
}

const countItems = (items: readonly ItemPatchNotes[]): number =>
  items.filter((i) => i.itemId !== null && i.notes.length > 0).length;

export function diffSummary(patch: Pick<Patch, "sections">): PatchDiffSummary {
  const s = patch.sections;
  return {
    generalNotes: s.general.reduce((n, g) => n + g.notes.filter((x) => !x.subtitle).length, 0),
    heroesChanged: s.heroes.length,
    heroAbilitiesChanged: s.heroes.reduce((n, h) => n + h.abilities.length, 0),
    itemsChanged: countItems(s.items),
    neutralItemsChanged: countItems(s.neutralItems),
    neutralCreepsChanged: s.neutralCreeps.length,
  };
}

/** Hero entries in the patch for the given pool, in patch order. */
export function changesAffectingPool(
  patch: Pick<Patch, "sections">,
  heroIds: readonly number[],
): HeroPatchNotes[] {
  const pool = new Set(heroIds);
  return patch.sections.heroes.filter((h) => pool.has(h.heroId));
}

/** Hero and item (including neutral item) entries matching a watchlist. */
export function changesAffectingWatchlist(
  patch: Pick<Patch, "sections">,
  watch: { heroIds: readonly number[]; itemIds: readonly number[] },
): { heroes: HeroPatchNotes[]; items: ItemPatchNotes[] } {
  const items = new Set(watch.itemIds);
  const matches = (i: ItemPatchNotes) => i.itemId !== null && items.has(i.itemId);
  return {
    heroes: changesAffectingPool(patch, watch.heroIds),
    items: [...patch.sections.items, ...patch.sections.neutralItems].filter(matches),
  };
}

export interface ReferenceEntry {
  key: string;
  name: string | null;
  iconPath: string | null;
}

export interface PatchReferences {
  abilities: ReadonlyMap<number, ReferenceEntry>;
  items: ReadonlyMap<number, ReferenceEntry>;
}

/** Attach ability/item keys, names and icons. Unknown ids keep null references. */
export function resolveReferences(sections: PatchSections, refs: PatchReferences): PatchSections {
  const item = (i: ItemPatchNotes): ItemPatchNotes => {
    const ref = i.itemId === null ? undefined : refs.items.get(i.itemId);
    return ref ? { ...i, itemKey: ref.key, itemName: ref.name, iconPath: ref.iconPath } : i;
  };
  return {
    ...sections,
    items: sections.items.map(item),
    neutralItems: sections.neutralItems.map(item),
    heroes: sections.heroes.map((h) => ({
      ...h,
      abilities: h.abilities.map((a) => {
        const ref = refs.abilities.get(a.abilityId);
        return ref
          ? { ...a, abilityKey: ref.key, abilityName: ref.name, iconPath: ref.iconPath }
          : a;
      }),
    })),
  };
}
