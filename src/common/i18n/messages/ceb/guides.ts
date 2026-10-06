import type { MessageTree } from "../../translate";
import type { guides as en } from "../en/guides";

export const guides: MessageTree<typeof en> = {
  title: "Mga hero guide",
  description:
    "Unsay gipalit sa mga pro sa matag hero, unsay hitsura sa kusgan nga dula, ug mga pro game nga matan-aw.",
  heroTitle: "Guide para kang {name}",
  heroDescription:
    "Unsay gipalit sa mga pro kang {name}, unsay hitsura sa kusgan nga dula, ug mga bag-ong pro game.",
  heroFallbackTitle: "Hero guide",
  unavailable: "Dili available karon. Sulayi usab unya.",
  index: {
    kicker: "Mga guide",
    title: "Mga hero guide",
    description:
      "Pagpili og hero aron makita kung unsay gipalit sa mga pro sa matag yugto, unsay hitsura sa kusgan nga dula niini, ug mga bag-ong pro game nga matan-aw.",
    heroesUnavailable:
      "Dili available ang lista sa hero karon. Sulayi usab human sa usa ka minuto.",
    attrs: {
      str: "Strength",
      agi: "Agility",
      int: "Intelligence",
      all: "Universal",
      other: "Uban pa",
    },
  },
  picker: {
    find: "Pangitag hero",
    noMatch: "Walay hero nga mohaum sa “{query}”.",
  },
  hero: {
    back: "Tanang hero",
    kicker: "Hero guide",
    fallbackName: "Hero #{id}",
  },
  items: {
    kicker: "Mga pro game",
    title: "Unsay gipalit sa mga pro",
    description:
      "Ang labing gipalit nga mga item sa matag yugto sa mga bag-ong professional game, gikan sa OpenDota. Wala giapil ang mga consumable human sa sinugdanan.",
    noData: "Walay data.",
    fallbackName: "Item #{id}",
    phases: {
      start: "Sinugdanang items",
      early: "Early game",
      mid: "Mid game",
      late: "Late game",
    },
  },
  bench: {
    kicker: "Mga benchmark",
    title: "Unsay hitsura sa kusgan nga dula",
    description:
      "Gikan sa mga bag-ong public game niining hero: ang kasagarang dula, ug unsay naabot sa labing maayong 10% ug 1% sa mga dula.",
    stat: "Stat",
    typical: "Kasagaran",
    top10: "Top 10%",
    top1: "Top 1%",
    stats: {
      gold_per_min: "Gold matag minuto",
      xp_per_min: "XP matag minuto",
      last_hits_per_min: "Last hits matag minuto",
      hero_damage_per_min: "Hero damage matag minuto",
      tower_damage: "Tower damage",
    },
  },
  proGames: {
    kicker: "Tan-aw ug pagkat-on",
    title: "Mga bag-ong pro game gamit si {hero}",
    summary:
      "{wins}–{losses} sa katapusang {n}. Ablihi ang usa para sa scoreboard, items ug mga graph.",
    none: "Walay bag-ong pro game.",
    win: "Daog",
    loss: "Pildi",
    unnamed: "Player nga walay ngalan",
    league: "League game",
    kdaTitle: "Kills / deaths / assists",
    kdaSr: "kills, deaths, assists",
  },
  counters: {
    kicker: "Mga pro game",
    title: "Mga matchup",
    description:
      "Win rate ni {hero} batok sa matag hero sa mga pro game. Ang mga hero lang nga adunay {min}+ ka dula ang giihap, ug ang gagmay nga sample gibira paingon sa 50% sa ranking.",
    strong: "Kusgan si {hero} batok sa",
    weak: "Naglisod si {hero} batok sa",
    none: "Wala pay klarong matchup.",
    games: "{n} ka dula",
  },
  notFound: {
    title: "Wala makit-i ang hero",
    body: "Walay hero nga adunay ingon niini nga ID. Pagpili og usa gikan sa lista.",
    back: "Tanang hero",
  },
};
