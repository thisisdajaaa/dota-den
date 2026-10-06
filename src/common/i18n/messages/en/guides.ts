/** UI copy for the guides feature. */
export const guides = {
  title: "Hero guides",
  description: "What pros buy on every hero, what strong games look like, and pro games to watch.",
  heroTitle: "{name} guide",
  heroDescription: "What pros buy on {name}, what strong games look like, and recent pro games.",
  heroFallbackTitle: "Hero guide",
  unavailable: "Unavailable right now. Try again later.",
  index: {
    kicker: "Guides",
    title: "Hero guides",
    description:
      "Pick a hero to see what pros buy in each phase, what strong games on it look like, and recent pro games to watch.",
    heroesUnavailable: "The hero list is unavailable right now. Try again in a minute.",
    attrs: {
      str: "Strength",
      agi: "Agility",
      int: "Intelligence",
      all: "Universal",
      other: "Other",
    },
  },
  picker: {
    find: "Find a hero",
    noMatch: "No hero matches “{query}”.",
  },
  hero: {
    back: "All heroes",
    kicker: "Hero guide",
    fallbackName: "Hero #{id}",
  },
  items: {
    kicker: "Pro games",
    title: "What pros buy",
    description:
      "Most-bought items in each phase of recent professional games, from OpenDota. Consumables are left out after the start.",
    noData: "No data.",
    fallbackName: "Item #{id}",
    phases: {
      start: "Starting items",
      early: "Early game",
      mid: "Mid game",
      late: "Late game",
    },
  },
  bench: {
    kicker: "Benchmarks",
    title: "What strong games look like",
    description:
      "From recent public games on this hero: the typical game, and what the best 10% and best 1% of games reached.",
    stat: "Stat",
    typical: "Typical",
    top10: "Top 10%",
    top1: "Top 1%",
    stats: {
      gold_per_min: "Gold per minute",
      xp_per_min: "XP per minute",
      last_hits_per_min: "Last hits per minute",
      hero_damage_per_min: "Hero damage per minute",
      tower_damage: "Tower damage",
    },
  },
  proGames: {
    kicker: "Watch and learn",
    title: "Recent pro games on {hero}",
    summary: "{wins}–{losses} in the last {n}. Open one for the scoreboard, items and graphs.",
    none: "No recent pro games.",
    win: "Win",
    loss: "Loss",
    unnamed: "Unnamed player",
    league: "League game",
    kdaTitle: "Kills / deaths / assists",
    kdaSr: "kills, deaths, assists",
  },
  counters: {
    kicker: "Pro games",
    title: "Matchups",
    description:
      "{hero}'s win rate against each hero in pro games. Only heroes with {min}+ games count, and small samples are pulled toward 50% when ranking.",
    strong: "{hero} is strong against",
    weak: "{hero} struggles against",
    none: "No clear matchups yet.",
    games: "{n} games",
  },
  notFound: {
    title: "Hero not found",
    body: "There's no hero with this ID. Pick one from the list.",
    back: "All heroes",
  },
} as const;
