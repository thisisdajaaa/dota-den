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
    loading: "Gi-load ang mga hero guide",
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
    loading: "Gi-load ang hero guide",
    back: "Tanang hero",
    kicker: "Hero guide",
    fallbackName: "Hero #{id}",
  },
  items: {
    kicker: { pubs: "Mga high-rank pub", pro: "Mga pro game" },
    title: { pubs: "Mga item build", pro: "Unsay gipalit sa mga pro" },
    description: {
      pubs: "Unsay gipalit sa mga nagdula og {hero} sa {position} sa katapusang tibuok semana sa mga duwa nga Legend hangtod Immortal (gikan sa STRATZ): ang mga sinugdanang item, dayon ang mga kompleto nga item sumala sa kasagarang minuto sa pagpalit, uban ang win rate sa mga duwa nga mipalit niini. Mas kanunay modaog ang mga item nga gipalit sa ulahi tungod kay ang tag-as nga mga duwa nga maayo ang dagan ang makaabot niini.",
      pro: "Ang labing gipalit nga mga item sa matag yugto sa mga bag-ong professional game, gikan sa OpenDota. Wala giapil ang mga consumable human sa sinugdanan.",
    },
    position: "Pos {n}",
    legend: "Bar: unsa ka kanunay gipalit · %: win rate sa maong mga duwa",
    positions: "Mga posisyon",
    minute: "{n} min",
    win: "{rate}%",
    winTitle: "Win rate sa {games} ka duwa nga mipalit niini",
    noData: "Walay data.",
    fallbackName: "Item #{id}",
    phases: {
      start: "Sinugdanang items",
      early: "Early game",
      mid: "Mid game",
      late: "Late game",
    },
  },
  build: {
    description:
      "{hero} sa {position}, sama sa in-game guide: ang sinugdanang items sa mga Legend hangtod Immortal, dayon ang items nga gibuhat sa kadaghanan sumala sa han-ay, uban ang tinuod nga timing gikan sa katapusang tibuok semana sa mga duwa (STRATZ). Ang situational kay mga item nga gamay ra ang mipalit.",
    steps: {
      start: "Sinugdanang items",
      early: "Early game",
      core: "Core build",
      situational: "Situational",
    },
    hints: {
      start: "Gipalit sa wala pa ang horn",
      early: "Unang 10 ka minuto",
      core: "Sumala sa han-ay sa pagpalit · kasagarang minuto",
      situational: "Gamay ra ang mipalit; depende sa duwa",
    },
    timings: {
      title: "Timing sa items",
      item: "Item",
      fast: "Paspas",
      typical: "Kasagaran",
      win: "Daog",
      note: "Paspas: usa sa upat ka player ang naa nay ingon niini sa maong minuto. Kasagaran: katunga. Mas taas ang win rate sa late items kay ang tag-as nga duwa nga maayo ang dagan ang makaabot niini.",
    },
  },
  skills: {
    kicker: "Mga pro game",
    title: "Skill build ug talents",
    description:
      "Ang skill nga gikuha sa kadaghanan sa pro sa matag level ni {hero}, gikan sa {n} ka bag-ong pro game nga adunay narekord nga skill order (OpenDota).",
    unavailable: "Kulang ang bag-ong pro game niini nga hero aron ipakita ang skill build.",
    ability: "Ability",
    talent: "Talent",
    talents: "Mga talent",
    talentNote:
      "Unsa ka kanunay gikuha sa mga pro ang matag kilid sa laray. Mausab ang numero sa talent matag patch, mao nga ang duwa ang magpakita sa eksaktong kantidad.",
  },
  wards: {
    kicker: "Support",
    title: "Mga ward spot",
    description:
      "Asa gibutang ang mga ward sa katapusang {n} ka pro game, sumala sa kilid ug oras. Mas dako nga tuldok, mas kanunay gigamit; ang numero ang ranggo sa spot.",
    mapAlt: "Mapa sa Dota 2 nga adunay labing gigamit nga ward spot",
    spotTitle: "Spot {rank}: {n} ka ward",
    none: "Walay kasagarang spot alang niini nga pili.",
    note: "Gikan sa mga parsed pro game sa OpenDota. Gihiusa ang mga spot sa gamay nga grid, mao nga ang usa ka tuldok mahimong maglangkob sa pipila ka duol nga cliff.",
    link: "Mapa sa ward spots",
    linkHint: "Asa magbutang og observer ug sentry ang mga pro, sumala sa kilid ug oras",
    kinds: { label: "Klase sa ward", observer: "Observer", sentry: "Sentry" },
    sides: { label: "Kilid", radiant: "Radiant", dire: "Dire" },
    phases: { label: "Oras", early: "0–10 min", mid: "10–25 min", late: "25+ min" },
    page: {
      title: "Mga ward spot",
      description:
        "Asa magbutang og observer ug sentry ward ang mga pro, sumala sa kilid ug oras sa duwa, gikan sa mga bag-ong pro game.",
      kicker: "Mga guide",
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
    kicker: { pubs: "Mga high-rank pub", pro: "Mga pro game" },
    title: "Mga matchup",
    description: {
      pubs: "Win rate ni {hero} batok sa matag hero sa katapusang tibuok semana sa mga duwa nga Legend hangtod Immortal (gikan sa STRATZ). Ang mga hero lang nga adunay {min}+ ka dula ang giihap, ug ang gagmay nga sample gibira paingon sa 50% sa ranking.",
      pro: "Win rate ni {hero} batok sa matag hero sa mga pro game. Ang mga hero lang nga adunay {min}+ ka dula ang giihap, ug ang gagmay nga sample gibira paingon sa 50% sa ranking.",
    },
    strong: "Kusgan si {hero} batok sa",
    weak: "Naglisod si {hero} batok sa",
    none: "Wala pay klarong matchup.",
    games: { one: "1 ka duwa", other: "{n} ka duwa" },
  },
  notFound: {
    title: "Wala makit-i ang hero",
    body: "Walay hero nga adunay ingon niini nga ID. Pagpili og usa gikan sa lista.",
    back: "Tanang hero",
  },
};
