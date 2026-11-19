import type { MessageTree } from "../../translate";
import type { ask as en } from "../en/ask";

export const ask: MessageTree<typeof en> = {
  title: "Ask Den",
  kicker: "AI coach",
  heading: "Ask Den",
  description:
    "Magtanong tungkol sa mga laro, hero, build, ward at meta mo, sa English, Filipino o Bisaya. Sumasagot si Den mula lang sa sarili mong data at sa public stats, at sinasabi niya kapag hindi niya alam.",
  disclaimer:
    "Puwedeng magkamali ang AI. Sinusuri ang bawat numero laban sa data namin bago mo makita.",
  inputLabel: "Ang tanong mo",
  placeholder: "Magtanong ng kahit ano tungkol sa Dota mo…",
  send: "Ipadala",
  thinking: "Nag-iisip si Den…",
  clear: "I-clear ang chat",
  you: "Ikaw",
  den: "Den",
  starters: {
    title: "Subukang itanong",
    lose: "Bakit ako talo lagi sa Pudge?",
    build: "Ano ang dapat kong i-build sa Lion?",
    wards: "Saan ako dapat mag-ward sa 10 minuto bilang Dire?",
    tilt: "Tilted na ba ako ngayong gabi?",
    meta: "Anong mga hero ang malakas sa bracket ko?",
    last: "Kumusta ang huling laro ko?",
  },
  status: {
    my_recent_games: "Tinitingnan ang mga huling laro mo…",
    my_hero_stats: "Sinusuri ang stats mo sa hero…",
    match_summary: "Binabasa ang laro…",
    my_sessions: "Sinusuri ang session mo ngayong gabi…",
    my_mmr: "Binubuksan ang MMR journal mo…",
    hero_guide: "Hinahanap ang build…",
    ward_spots: "Hinahanap ang mga ward spot…",
    hero_counters: "Sinusuri ang mga matchup…",
    meta_heroes: "Sinusuri ang meta…",
  },
  sources: {
    label: "Batay sa",
    your_games: { one: "huling laro mo", other: "huling {n} laro mo" },
    your_parsed_games: { one: "1 parsed na replay", other: "{n} parsed na replay" },
    your_match: "larong ito",
    your_sessions: "mga play session mo",
    your_mmr: "MMR journal mo",
    high_rank_pubs: "STRATZ Legend–Immortal pubs",
    pro_games: "mga pro game",
    bracket_pubs: "mga public game sa {bracket}",
  },
  quota: {
    left: { one: "1 tanong na lang ngayong araw", other: "{n} tanong pa ngayong araw" },
    resets: "Magre-reset sa hatinggabi, oras sa Manila.",
  },
  out: {
    title: "Ubos na ang mga tanong mo ngayong araw",
    free: "May {free} tanong kada araw ang mga free player. May {plus} kada araw ang mga Plus member, at unlimited na AI coach review.",
    plus: "Nagamit mo na ang {n} tanong ngayong araw. Magre-reset ito sa hatinggabi, oras sa Manila.",
    seePlus: "Tingnan ang Plus",
  },
  fallback:
    "Hindi ko masuportahan ng data mo ang sagot, kaya hindi ako manghuhula. Subukang itanong sa ibang paraan, o tungkol sa isang hero o laro. Hindi nabilang ang tanong na ito.",
  errors: {
    resting: "Nagpapahinga si Den ngayong araw (ubos na ang AI budget). Subukan ulit bukas.",
    unavailable:
      "Hindi sumasagot ang AI ngayon. Subukan ulit maya-maya. Hindi nabilang ang tanong mo.",
    rate: "Ang dami ng tanong nang sabay. Maghintay ng isang minuto at subukan ulit.",
    offline: "Hindi maabot ang Dota Den ngayon.",
    generic: "May nagkaproblema. Hindi nabilang ang tanong mo.",
  },
  off: "Hindi available ang Ask Den ngayon.",
  match: {
    entry: "Tanungin si Den tungkol sa larong ito",
    question: "Kumusta ang laro ko rito, at ano ang dapat kong pagbutihin sa susunod?",
    context: "Tungkol sa match {id}",
  },
};
