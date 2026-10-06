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
    back: "Lahat ng hero",
    kicker: "Hero guide",
    fallbackName: "Hero #{id}",
  },
  items: {
    kicker: "Mga pro game",
    title: "Ano ang binibili ng mga pro",
    description:
      "Ang mga pinakabinibiling item sa bawat yugto ng mga bagong professional game, mula sa OpenDota. Hindi kasama ang mga consumable pagkatapos ng simula.",
    noData: "Walang data.",
    fallbackName: "Item #{id}",
    phases: {
      start: "Panimulang items",
      early: "Early game",
      mid: "Mid game",
      late: "Late game",
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
    kicker: "Mga pro game",
    title: "Mga matchup",
    description:
      "Win rate ni {hero} laban sa bawat hero sa mga pro game. Ang mga hero lang na may {min}+ laro ang binibilang, at hinihila papuntang 50% ang maliliit na sample sa ranking.",
    strong: "Malakas si {hero} laban sa",
    weak: "Nahihirapan si {hero} laban sa",
    none: "Wala pang malinaw na matchup.",
    games: "{n} laro",
  },
  notFound: {
    title: "Hindi nahanap ang hero",
    body: "Walang hero na may ganitong ID. Pumili ng isa mula sa listahan.",
    back: "Lahat ng hero",
  },
};
