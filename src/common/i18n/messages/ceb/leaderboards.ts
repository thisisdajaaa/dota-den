import type { MessageTree } from "../../translate";
import type { leaderboards as en } from "../en/leaderboards";

export const leaderboards: MessageTree<typeof en> = {
  boards: {
    drafts: "Mga draft game",
    challenges: "Mga draft challenge",
    rooms: "Mga friend room",
  },
  scopes: { friends: "Mga higala", everyone: "Tanan" },
  periods: { week: "Karong semanaha", all: "Tanang panahon" },
  rules: {
    drafts:
      "Gi-ranggo sumala sa nahuman nga draft batok sa AI captain o sa practice, dayon sumala sa pinakataas nga draft score. Ang draft score mao ang report card score sa imong kiliran gikan sa draft outlook (0–100, 50 ang kasagaran). Walay score ang mga practice draft, diin ikaw ang nagduwa sa duha ka kiliran.",
    challenges:
      "Gi-ranggo sumala sa husto nga tubag (gi-grado og Good o Excellent), dayon sumala sa pinakataas nga streak. Ang imong unang tubag ra sa matag puzzle ang giihap.",
    rooms:
      "Gi-ranggo sumala sa nahuman nga room draft, dayon sumala sa daog. Ang daog ug pildi gi-report mismo sa mga captain human sa duwa ug wala gi-verify; ang mga draft nga walay gi-report nga resulta giihap ra nga gidula.",
  },
  weekStarts: "Magsugod ang semana matag Lunes 00:00 UTC.",
  units: {
    drafts: { one: "{n} ka draft", other: "{n} ka draft" },
    challenges: { one: "{n} ka husto nga tubag", other: "{n} ka husto nga tubag" },
    rooms: { one: "{n} ka room draft", other: "{n} ka room draft" },
    player: { one: "{n} ka player", other: "{n} ka player" },
    answer: { one: "1 ka tubag", other: "{n} ka tubag" },
  },
  cta: {
    drafts: "Pagsugod og draft",
    challenges: "Sulayi ang challenge",
    rooms: "Pag-draft uban sa higala",
  },
  stats: {
    drafts: "Mga draft",
    bestScore: "Pinakataas nga score",
    grade: "Grado {grade}",
    avgScore: "Average nga score",
    correct: "Husto",
    bestStreak: "Pinakataas nga streak",
    accuracy: "Katukma",
    ofAnswers: "sa {answers}",
    wins: "Daog",
    selfReported: "kaugalingong report",
    losses: "Pildi",
  },
  board: {
    label: "Leaderboard sa {board}",
    you: "Ikaw",
    rankUnknown: "Wala mahibal-i ang ranggo",
    rowLabel: "Ranggo {rank}: {name}",
    rowLabelYou: "Ranggo {rank}: {name} (ikaw)",
    inviteBefore: "Pagdapit og higala: paghimo og room sa",
    inviteAfter: "ug ipadala kanila ang link. Kung mag-sign in ug moduwa sila, mogawas sila dinhi.",
    nobody: "Wala pay nagduwa.",
    nobodyWeek: "Wala pay nagduwa karong semanaha.",
    noAccountsTitle: "Wala pay Dota Den account ang imong mga higala",
    noAccountsBody:
      "Ang mga higala mao ang mga player nga imong gi-track, imong mga kauban sa OpenDota ug ang mga tawo nga imong nakauban sa draft sa mga room, kung naka-sign in na sila dinhi.",
    noAccounts: "Wala pay Dota Den account ang imong mga higala.",
    friendsNotPlayed: "Wala pay nagduwa sa imong mga higala.",
    friendsNotPlayedWeek: "Wala pay nagduwa sa imong mga higala karong semanaha.",
    friendsIncomplete:
      "Dili ma-load karon ang pipila sa imong mga higala (basin busy ang OpenDota), mao nga basin kulang ang mga tawo niini nga board.",
    yourPosition: "Imong posisyon",
    total: { one: "1 ka player niini nga board.", other: "{n} ka player niini nga board." },
    totalWeek: {
      one: "1 ka player niini nga board karong semanaha.",
      other: "{n} ka player niini nga board karong semanaha.",
    },
    notOnYet: "Wala ka pa dinhi.",
    notOnYetWeek: "Wala ka pa dinhi karong semanaha.",
  },
  rankedWeek: {
    kicker: "Katapusang 7 ka adlaw",
    title: "Ranked karong semanaha",
    description:
      "Ikaw ug imong mga higala (mga player nga imong gi-track, kanunay nga kauban ug kaatbang sa room), sumala sa ranked nga daog kuhaan sa pildi. Ang MMR kay banabana nga ±25 matag duwa: wala gipaambit sa Valve ang tinuod nga MMR.",
    empty: "Walay ranked nga duwa gikan nimo o sa imong mga higala sa katapusang 7 ka adlaw.",
    you: "(ikaw)",
    bestTitle: "Labing maayo karong semanaha: {hero} {record}",
    idle: "{n} ang wala nagduwa og ranked",
    unknown: "{n} ang dili mabasa (pribado ang data o busy ang OpenDota)",
    friendsIncomplete: "dili ma-load ang pipila ka higala",
  },
  standing: {
    kicker: "Leaderboards",
    title: "Imong posisyon taliwala sa mga higala",
    label: "Imong posisyon",
    notPlayed: "Wala pa nagduwa",
    unavailable:
      "Dili available karon ang imong posisyon. Wala maapektuhi ang uban pang bahin sa imong kinatibuk-an.",
    loading: "Gi-load ang imong posisyon",
  },
  visibility: {
    listed: "Nalista na ka sa mga board nga Tanan.",
    unlisted: "Wala na ka nalista sa publiko.",
    saveError: "Dili ma-save kana. Sulayi pag-usab.",
    label: "Ipakita ko sa mga board nga Tanan",
    help: "Naka-off sa default. Makita ka gihapon sa imong mga higala sa mga board nga Mga higala.",
  },
  page: {
    title: "Leaderboards",
    kicker: "Pakigsangka",
    description:
      "Tan-awa kinsa ang pinakadaghang nag-draft sa imong mga higala, o sa tibuok Dota Den. Adunay kaugalingong board ang mga draft game, draft challenge ug friend room.",
    invite: "Pagdapit og higala",
    loadingRanked: "Gi-load ang ranked karong semanaha",
    boardTabs: "Leaderboard",
    whoTabs: "Kinsa",
    whenTabs: "Kanus-a",
    everyoneNote:
      "Ang mga player ra nga mipili nga malista ang mogawas sa mga board nga Tanan (kanunay nimong makita ang imong kaugalingong row).",
    unavailableTitle: "Dili available karon kini nga leaderboard",
    unavailableBody:
      "Palihug sulayi pag-usab human sa usa ka minuto. Gi-save gihapon ang imong mga draft ug tubag.",
    loading: "Gi-load ang leaderboard",
  },
};
