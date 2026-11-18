/**
 * Skill builds (pure): the order recent pro players put points into a hero's abilities, and
 * which talents they took. Built only from the games' recorded upgrade orders.
 */

/** One of the hero's abilities as the game files name it. */
export interface AbilityRef {
  id: number;
  name: string;
  imageUrl: string | null;
}

/** One talent option; tier 1–4 is the level 10/15/20/25 row. */
export interface TalentRef {
  id: number;
  name: string;
  tier: 1 | 2 | 3 | 4;
}

export interface SkillBuild {
  /** Games the build is taken from. */
  games: number;
  /** Ability (or talent) id picked at each level from 1, the most common choice per level. */
  order: number[];
  /** Abilities that appear in `order`, in the hero's own ability order. */
  abilities: AbilityRef[];
  /** Each talent row (level 10 first) with how often each side was taken. */
  talents: Array<{
    level: number;
    options: Array<{ id: number; name: string; picks: number; share: number }>;
  }>;
}

/** Fewer games than this and there's no build to show. */
export const MIN_SKILL_GAMES = 8;
/** Levels 1–16 each give a skill point, so the first 16 points line up with those levels. */
export const SKILL_LEVELS = 16;
export const TALENT_LEVELS = [10, 15, 20, 25] as const;

/**
 * Most common choice at each level across the games, never putting more points into an
 * ability than any of the games did (so the ultimate stays at its real cap). Talents that
 * show up at a level count as a vote for "take a talent here"; the talent row says which.
 */
export function skillBuild(
  builds: readonly (readonly number[])[],
  kit: { abilities: readonly AbilityRef[]; talents: readonly TalentRef[] },
): SkillBuild | null {
  const games = builds.filter((b) => b.length > 0);
  if (games.length < MIN_SKILL_GAMES) return null;
  const known = new Set(kit.abilities.map((a) => a.id));
  const talentIds = new Set(kit.talents.map((t) => t.id));
  const TALENT = -1;
  const cap = new Map<number, number>();
  for (const b of games) {
    const counts = new Map<number, number>();
    for (const id of b) if (known.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) cap.set(id, Math.max(cap.get(id) ?? 0, n));
  }

  const order: number[] = [];
  const used = new Map<number, number>();
  for (let level = 0; level < SKILL_LEVELS; level++) {
    const votes = new Map<number, number>();
    for (const b of games) {
      const id = b[level];
      if (id === undefined) continue;
      const key = talentIds.has(id) ? TALENT : known.has(id) ? id : undefined;
      if (key !== undefined) votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const ranked = [...votes]
      .filter(([id]) => id === TALENT || (used.get(id) ?? 0) < (cap.get(id) ?? 0))
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const choice = ranked[0]?.[0];
    if (choice === undefined) break;
    order.push(choice);
    if (choice !== TALENT) used.set(choice, (used.get(choice) ?? 0) + 1);
  }

  const talents = TALENT_LEVELS.map((level, i) => {
    const row = kit.talents.filter((t) => t.tier === i + 1);
    const picks = row.map((t) => ({
      id: t.id,
      name: t.name,
      picks: games.filter((b) => b.includes(t.id)).length,
    }));
    const total = picks.reduce((n, p) => n + p.picks, 0);
    return {
      level,
      options: picks.map((p) => ({ ...p, share: total ? p.picks / total : 0 })),
    };
  }).filter((r) => r.options.length > 0);

  // Talent levels in `order` show the row's most taken talent.
  const filled = order.map((id, i) => {
    if (id !== TALENT) return id;
    const row = talents.find((r) => r.level === i + 1);
    const best = row?.options.reduce((a, b) => (b.picks > a.picks ? b : a));
    return best && best.picks > 0 ? best.id : TALENT;
  });
  const inOrder = new Set(filled);
  return {
    games: games.length,
    order: filled,
    abilities: kit.abilities.filter((a) => inOrder.has(a.id)),
    talents,
  };
}

/**
 * A talent's name without the number the game fills in at runtime ("+{s:bonus_damage} Damage"
 * becomes "+ Damage"): the constants don't carry those numbers, and we don't guess them.
 */
export function talentName(raw: string): string {
  return raw
    .replace(/^([+-])\{s:[^}]+\}[%sx]?\s*/, "$1 ")
    .replace(/\{s:[^}]+\}[%sx]?\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
