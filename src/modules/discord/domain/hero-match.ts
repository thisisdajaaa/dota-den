/**
 * Hero names typed into Discord (pure): the autocomplete list, and turning what was typed
 * into a hero. Discord lets people send free text even with autocomplete, so both paths
 * accept a hero id (picked from the list) or a name, or a common nickname ("am", "pa").
 */

export interface BotHero {
  id: number;
  name: string;
}

/** Nicknames players use in chat, by hero name (only the ones prefixes don't already find). */
const NICKNAMES: Record<string, string> = {
  am: "Anti-Mage",
  bb: "Bristleback",
  bh: "Bounty Hunter",
  bs: "Bloodseeker",
  cm: "Crystal Maiden",
  ck: "Chaos Knight",
  dk: "Dragon Knight",
  ds: "Dark Seer",
  dp: "Death Prophet",
  es: "Earthshaker",
  et: "Elder Titan",
  lc: "Legion Commander",
  ld: "Lone Druid",
  ls: "Lifestealer",
  mk: "Monkey King",
  np: "Nature's Prophet",
  ns: "Night Stalker",
  od: "Outworld Destroyer",
  pa: "Phantom Assassin",
  pl: "Phantom Lancer",
  qop: "Queen of Pain",
  sb: "Spirit Breaker",
  sf: "Shadow Fiend",
  sk: "Sand King",
  ss: "Shadow Shaman",
  ta: "Templar Assassin",
  tb: "Terrorblade",
  wd: "Witch Doctor",
  wk: "Wraith King",
  wr: "Windranger",
  io: "Io",
  wisp: "Io",
  kotl: "Keeper of the Light",
  aa: "Ancient Apparition",
  furion: "Nature's Prophet",
  void: "Faceless Void",
  sven: "Sven",
  storm: "Storm Spirit",
  jugg: "Juggernaut",
  necro: "Necrophos",
  veno: "Venomancer",
  alch: "Alchemist",
  brew: "Brewmaster",
  bat: "Batrider",
  clock: "Clockwerk",
  ench: "Enchantress",
  invo: "Invoker",
  morph: "Morphling",
  naga: "Naga Siren",
  potm: "Mirana",
  skywrath: "Skywrath Mage",
  sky: "Skywrath Mage",
  tusk: "Tusk",
  ww: "Winter Wyvern",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const initials = (name: string) =>
  norm(name)
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("");

/** How well `query` names `hero` (higher is better; 0: not at all). */
function score(query: string, hero: BotHero): number {
  const q = norm(query);
  if (!q) return 0;
  const name = norm(hero.name);
  if (name === q) return 100;
  const nick = NICKNAMES[q.replace(/ /g, "")];
  if (nick && norm(nick) === name) return 90;
  if (name.replace(/ /g, "") === q.replace(/ /g, "")) return 85;
  if (name.startsWith(q)) return 70;
  if (name.split(" ").some((w) => w.startsWith(q))) return 60;
  if (q.length >= 2 && initials(hero.name) === q) return 55;
  if (q.length >= 3 && name.includes(q)) return 40;
  return 0;
}

/** Up to `limit` heroes for what's typed so far (all heroes A–Z when nothing is typed). */
export function heroChoices(query: string, heroes: readonly BotHero[], limit = 25): BotHero[] {
  const sorted = [...heroes].sort((a, b) => a.name.localeCompare(b.name));
  if (!norm(query)) return sorted.slice(0, limit);
  return sorted
    .map((h) => ({ h, s: score(query, h) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.h.name.localeCompare(b.h.name))
    .slice(0, limit)
    .map((x) => x.h);
}

export type HeroResolution = { ok: true; hero: BotHero } | { ok: false; input: string };

/**
 * The hero meant by an option's value: an id from the autocomplete list, else the single best
 * name match. Ambiguous text ("void": Faceless Void or Void Spirit) takes the nickname or the
 * best-scoring name; text that matches nothing is reported back, never guessed.
 */
export function resolveHero(value: string, heroes: readonly BotHero[]): HeroResolution {
  const v = value.trim();
  if (/^\d{1,4}$/.test(v)) {
    const hero = heroes.find((h) => h.id === Number(v));
    if (hero) return { ok: true, hero };
  }
  const [best] = heroChoices(v, heroes, 1);
  return best && norm(v) ? { ok: true, hero: best } : { ok: false, input: v };
}
