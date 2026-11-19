import type { MessageTree } from "../../translate";
import type { ask as en } from "../en/ask";

export const ask: MessageTree<typeof en> = {
  title: "Ask Den",
  kicker: "AI coach",
  heading: "Ask Den",
  description:
    "Pangutana bahin sa imong mga duwa, hero, build, ward ug meta, sa English, Filipino o Bisaya. Motubag si Den gikan lang sa imong kaugalingong data ug sa public stats, ug moingon siya kung wala siya kahibalo.",
  disclaimer:
    "Mahimong masayop ang AI. Gisusi ang matag numero batok sa among data sa dili pa nimo makita.",
  inputLabel: "Imong pangutana",
  placeholder: "Pangutana bisan unsa bahin sa imong Dota…",
  send: "Ipadala",
  thinking: "Naghunahuna si Den…",
  clear: "I-clear ang chat",
  you: "Ikaw",
  den: "Den",
  starters: {
    title: "Sulayi pangutana",
    lose: "Nganong pirmi ko pildi sa Pudge?",
    build: "Unsa may angay nakong i-build sa Lion?",
    wards: "Asa ko mag-ward sa 10 minutos isip Dire?",
    tilt: "Tilted na ba ko karong gabii?",
    meta: "Unsang mga hero ang kusog sa akong bracket?",
    last: "Kumusta akong katapusang duwa?",
  },
  status: {
    my_recent_games: "Gitan-aw ang imong bag-ong mga duwa…",
    my_hero_stats: "Gisusi ang imong stats sa hero…",
    match_summary: "Gibasa ang duwa…",
    my_sessions: "Gisusi ang imong session karong gabii…",
    my_mmr: "Giablihan ang imong MMR journal…",
    hero_guide: "Gipangita ang build…",
    ward_spots: "Gipangita ang mga ward spot…",
    hero_counters: "Gisusi ang mga matchup…",
    meta_heroes: "Gisusi ang meta…",
  },
  sources: {
    label: "Base sa",
    your_games: { one: "imong katapusang duwa", other: "imong katapusang {n} ka duwa" },
    your_parsed_games: { one: "1 ka parsed nga replay", other: "{n} ka parsed nga replay" },
    your_match: "kini nga duwa",
    your_sessions: "imong mga play session",
    your_mmr: "imong MMR journal",
    high_rank_pubs: "STRATZ Legend–Immortal pubs",
    pro_games: "mga pro game",
    bracket_pubs: "mga public game sa {bracket}",
  },
  quota: {
    left: {
      one: "1 na lang ka pangutana karong adlawa",
      other: "{n} pa ka pangutana karong adlawa",
    },
    resets: "Mo-reset sa tungang gabii, oras sa Manila.",
  },
  out: {
    title: "Nahurot na imong mga pangutana karong adlawa",
    free: "Ang mga free player adunay {free} ka pangutana kada adlaw. Ang mga Plus member adunay {plus} kada adlaw, ug unlimited nga AI coach review.",
    plus: "Nagamit na nimo ang {n} ka pangutana karong adlawa. Mo-reset kini sa tungang gabii, oras sa Manila.",
    seePlus: "Tan-awa ang Plus",
  },
  fallback:
    "Dili nako masuportahan sa imong data ang tubag, busa dili ko manag-an. Sulayi pangutana sa laing paagi, o bahin sa usa ka hero o duwa. Wala maihap kini nga pangutana.",
  errors: {
    resting: "Nagpahulay si Den karong adlawa (nahurot na ang AI budget). Sulayi pag-usab ugma.",
    unavailable:
      "Dili motubag ang AI karon. Sulayi pag-usab unya-unya. Wala maihap imong pangutana.",
    rate: "Daghan kaayong pangutana dungan. Paghulat og usa ka minuto ug sulayi pag-usab.",
    offline: "Dili maabot ang Dota Den karon.",
    generic: "Naay problema. Wala maihap imong pangutana.",
  },
  off: "Dili available ang Ask Den karon.",
  match: {
    entry: "Pangutan-a si Den bahin niini nga duwa",
    question: "Kumusta akong duwa diri, ug unsa may angay nakong ayohon sa sunod?",
    context: "Bahin sa match {id}",
  },
};
