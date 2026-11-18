import type { MessageTree } from "../../translate";
import type { guides as en } from "../en/guides";

export const guides: MessageTree<typeof en> = {
  title: "Mga hero guide",
  description:
    "Ano ang binibili ng mga pro sa bawat hero, ano ang itsura ng malakas na laro, at mga pro game na mapapanood.",
  heroTitle: "Guide para kay {name}",
  heroDescription:
    "Ano ang binibili ng mga pro kay {name}, ano ang itsura ng malakas na laro, at mga bagong pro game.",
  heroFallbackTitle: "Hero guide",
  unavailable: "Hindi available ngayon. Subukan ulit mamaya.",
  index: {
    loading: "Nilo-load ang mga hero guide",
    kicker: "Mga guide",
    title: "Mga hero guide",
    description:
      "Pumili ng hero para makita kung ano ang binibili ng mga pro sa bawat yugto, ano ang itsura ng malakas na laro rito, at mga bagong pro game na mapapanood.",
    heroesUnavailable:
      "Hindi available ang listahan ng hero ngayon. Subukan ulit pagkalipas ng isang minuto.",
    attrs: {
      str: "Strength",
      agi: "Agility",
      int: "Intelligence",
      all: "Universal",
      other: "Iba pa",
    },
  },
  picker: {
    find: "Maghanap ng hero",
    noMatch: "Walang hero na tugma sa “{query}”.",
  },
  hero: {
    loading: "Nilo-load ang hero guide",
    back: "Lahat ng hero",
    kicker: "Hero guide",
    fallbackName: "Hero #{id}",
  },
  items: {
    kicker: { pubs: "Mga high-rank pub", pro: "Mga pro game" },
    title: { pubs: "Mga item build", pro: "Ano ang binibili ng mga pro" },
    description: {
      pubs: "Ano ang binibili ng mga naglalaro ng {hero} sa {position} sa huling buong linggo ng mga larong Legend hanggang Immortal (mula sa STRATZ): ang mga panimulang item, tapos ang mga buong item ayon sa karaniwang minuto ng pagbili, kasama ang win rate ng mga larong bumili nito. Mas madalas manalo ang mga item na binibili nang mas huli dahil bahagyang umaabot doon ang mahahabang larong maganda ang takbo.",
      pro: "Ang mga pinakabinibiling item sa bawat yugto ng mga bagong professional game, mula sa OpenDota. Hindi kasama ang mga consumable pagkatapos ng simula.",
    },
    position: "Pos {n}",
    legend: "Bar: gaano kadalas binibili · %: win rate ng mga larong iyon",
    positions: "Mga posisyon",
    minute: "{n} min",
    win: "{rate}%",
    winTitle: "Win rate ng {games} larong bumili nito",
    noData: "Walang data.",
    fallbackName: "Item #{id}",
    phases: {
      start: "Panimulang items",
      early: "Early game",
      mid: "Mid game",
      late: "Late game",
    },
  },
  build: {
    description:
      "{hero} sa {position}, gaya ng in-game guide: ang panimulang items ng mga Legend hanggang Immortal, tapos ang items na binuo ng karamihan ayon sa pagkakasunod, kasama ang totoong timing mula sa huling buong linggo ng laro (STRATZ). Ang situational ay mga item na mas kaunti ang bumibili.",
    steps: {
      start: "Panimulang items",
      early: "Early game",
      core: "Core build",
      situational: "Situational",
    },
    hints: {
      start: "Binili bago ang horn",
      early: "Unang 10 minuto",
      core: "Ayon sa pagkakasunod ng pagbili · karaniwang minuto",
      situational: "Mas kaunti ang bumibili; depende sa laro",
    },
    timings: {
      title: "Timing ng items",
      item: "Item",
      fast: "Mabilis",
      typical: "Karaniwan",
      win: "Panalo",
      note: "Mabilis: ikaapat ng mga player ang mayroon na nito pagsapit ng minutong iyon. Karaniwan: kalahati. Mas mataas ang win rate ng late items dahil umaabot dito ang mahahabang larong maganda ang takbo.",
    },
  },
  skills: {
    kicker: "Mga pro game",
    title: "Skill build at talents",
    description:
      "Ang skill na kinuha ng karamihan ng pro sa bawat level ni {hero}, mula sa {n} bagong pro game na may naitalang skill order (OpenDota).",
    unavailable: "Kulang ang bagong pro game sa hero na ito para magpakita ng skill build.",
    ability: "Ability",
    talent: "Talent",
    talents: "Mga talent",
    talentNote:
      "Gaano kadalas kinuha ng mga pro ang bawat panig ng hilera. Nagbabago ang numero ng talent kada patch, kaya ang laro ang nagpapakita ng eksaktong halaga.",
  },
  wards: {
    kicker: "Support",
    title: "Mga ward spot",
    description:
      "Kung saan naglagay ng ward sa huling {n} pro game, ayon sa panig at oras. Mas malaking tuldok, mas madalas gamitin; ang numero ang ranggo ng spot.",
    mapAlt: "Mapa ng Dota 2 na may pinakaginagamit na ward spot",
    spotTitle: "Spot {rank}: {n} ward",
    none: "Walang karaniwang spot para sa pinili.",
    note: "Mula sa mga parsed pro game ng OpenDota. Pinagsasama ang mga spot sa maliit na grid, kaya puwedeng sakop ng isang tuldok ang ilang malapit na cliff.",
    link: "Mapa ng ward spots",
    linkHint: "Kung saan naglalagay ng observer at sentry ang mga pro, ayon sa panig at oras",
    kinds: { label: "Uri ng ward", observer: "Observer", sentry: "Sentry" },
    sides: { label: "Panig", radiant: "Radiant", dire: "Dire" },
    phases: { label: "Oras", early: "0–10 min", mid: "10–25 min", late: "25+ min" },
    page: {
      title: "Mga ward spot",
      description:
        "Kung saan naglalagay ng observer at sentry ward ang mga pro, ayon sa panig at oras ng laro, mula sa mga bagong pro game.",
      kicker: "Mga guide",
    },
  },
  bench: {
    kicker: "Mga benchmark",
    title: "Ano ang itsura ng malakas na laro",
    description:
      "Mula sa mga bagong public game sa hero na ito: ang karaniwang laro, at kung ano ang naabot ng pinakamahusay na 10% at 1% ng mga laro.",
    stat: "Stat",
    typical: "Karaniwan",
    top10: "Top 10%",
    top1: "Top 1%",
    stats: {
      gold_per_min: "Gold kada minuto",
      xp_per_min: "XP kada minuto",
      last_hits_per_min: "Last hits kada minuto",
      hero_damage_per_min: "Hero damage kada minuto",
      tower_damage: "Tower damage",
    },
  },
  proGames: {
    kicker: "Manood at matuto",
    title: "Mga bagong pro game gamit si {hero}",
    summary:
      "{wins}–{losses} sa huling {n}. Buksan ang isa para sa scoreboard, items at mga graph.",
    none: "Walang bagong pro game.",
    win: "Panalo",
    loss: "Talo",
    unnamed: "Walang pangalang player",
    league: "League game",
    kdaTitle: "Kills / deaths / assists",
    kdaSr: "kills, deaths, assists",
  },
  counters: {
    kicker: { pubs: "Mga high-rank pub", pro: "Mga pro game" },
    title: "Mga matchup",
    description: {
      pubs: "Win rate ni {hero} laban sa bawat hero sa huling buong linggo ng mga larong Legend hanggang Immortal (mula sa STRATZ). Ang mga hero lang na may {min}+ laro ang binibilang, at hinihila papuntang 50% ang maliliit na sample sa ranking.",
      pro: "Win rate ni {hero} laban sa bawat hero sa mga pro game. Ang mga hero lang na may {min}+ laro ang binibilang, at hinihila papuntang 50% ang maliliit na sample sa ranking.",
    },
    strong: "Malakas si {hero} laban sa",
    weak: "Nahihirapan si {hero} laban sa",
    none: "Wala pang malinaw na matchup.",
    games: { one: "1 laro", other: "{n} laro" },
  },
  notFound: {
    title: "Hindi nahanap ang hero",
    body: "Walang hero na may ganitong ID. Pumili ng isa mula sa listahan.",
    back: "Lahat ng hero",
  },
};
