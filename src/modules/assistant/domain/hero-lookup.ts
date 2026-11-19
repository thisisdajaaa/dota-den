/**
 * Hero names as players type them (pure): "anti mage", "Anti-Mage", "AM", "pudge". Nicknames
 * are the common English ones; anything unclear returns no hero rather than a guess.
 */

export interface NamedHero {
  id: number;
  name: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");

/** Nicknames → the hero's catalog name. */
const NICKNAMES: Record<string, string> = {
  am: "Anti-Mage",
  antimage: "Anti-Mage",
  pa: "Phantom Assassin",
  pl: "Phantom Lancer",
  wr: "Windranger",
  cm: "Crystal Maiden",
  sf: "Shadow Fiend",
  od: "Outworld Destroyer",
  qop: "Queen of Pain",
  es: "Earthshaker",
  et: "Elder Titan",
  ta: "Templar Assassin",
  ck: "Chaos Knight",
  dk: "Dragon Knight",
  wk: "Wraith King",
  sk: "Sand King",
  bb: "Bristleback",
  ss: "Shadow Shaman",
  ww: "Winter Wyvern",
  wd: "Witch Doctor",
  np: "Nature's Prophet",
  furion: "Nature's Prophet",
  ns: "Night Stalker",
  void: "Faceless Void",
  fv: "Faceless Void",
  sb: "Spirit Breaker",
  bara: "Spirit Breaker",
  lc: "Legion Commander",
  ds: "Dark Seer",
  dw: "Dark Willow",
  ld: "Lone Druid",
  ts: "Timbersaw",
  timber: "Timbersaw",
  kotl: "Keeper of the Light",
  ogre: "Ogre Magi",
  aa: "Ancient Apparition",
  veno: "Venomancer",
  invo: "Invoker",
  jugg: "Juggernaut",
  storm: "Storm Spirit",
  ember: "Ember Spirit",
  sniper: "Sniper",
  slark: "Slark",
  lina: "Lina",
  lion: "Lion",
  techies: "Techies",
  mk: "Monkey King",
  tb: "Terrorblade",
  ench: "Enchantress",
  bh: "Bounty Hunter",
  bs: "Bloodseeker",
  ls: "Lifestealer",
  naix: "Lifestealer",
  cent: "Centaur Warrunner",
  centaur: "Centaur Warrunner",
  doom: "Doom",
  necro: "Necrophos",
  sd: "Shadow Demon",
  tinker: "Tinker",
  zeus: "Zeus",
  potm: "Mirana",
  rubick: "Rubick",
  magnus: "Magnus",
  mag: "Magnus",
};

/** The hero the text names, or null when it names none (or it's ambiguous). */
export function findHero<H extends NamedHero>(text: string, heroes: readonly H[]): H | null {
  const q = norm(text);
  if (!q) return null;
  const byName = new Map(heroes.map((h) => [norm(h.name), h]));
  const exact = byName.get(q);
  if (exact) return exact;
  const nick = NICKNAMES[q] ?? NICKNAMES[text.trim().toLowerCase().replace(/\s+/g, "_")];
  if (nick) return byName.get(norm(nick)) ?? null;
  // A unique prefix ("anti" → Anti-Mage), never a guess between several heroes.
  if (q.length >= 3) {
    const prefix = heroes.filter((h) => norm(h.name).startsWith(q));
    if (prefix.length === 1) return prefix[0];
  }
  return null;
}
