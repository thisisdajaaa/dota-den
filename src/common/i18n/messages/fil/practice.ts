import type { MessageTree } from "../../translate";
import type { practice as en } from "../en/practice";

export const practice: MessageTree<typeof en> = {
  title: "Plano sa pagpraktis",
  kicker: "Ngayong linggo",
  basic: "Kulang pa ang data para sa personal na plano, kaya heto muna ang mga basic.",
  empty: "Wala nang natitirang hakbang ngayong linggo. May bagong plano sa susunod na linggo.",
  swap: "Palitan ang hakbang {n}",
  dismiss: "Alisin ang hakbang {n}",
  updateFailed: "Hindi mabago ang plano mo.",
  openMatch: "Buksan ang laro",
  status: { done: "Tapos na", broken: "Nasira ngayong linggo", open: "Ginagawa pa" },
  step: {
    practiceHero: {
      one: "Laruin si {hero} sa 1 ranked game",
      other: "Laruin si {hero} sa {n} ranked game",
    },
    stopAfterLosses: "Tapusin ang session pagkatapos ng {streak} sunod-sunod na talo",
    reviewLoss: "Balikan ang talo mo bilang {hero} noong {date}",
    logMmr: "I-log ang MMR mo pagkatapos ng bawat session",
  },
  why: {
    highRank: "{rate}% win rate sa matataas na rank bilang Pos {position} ({games}).",
    contest: "Pinili o na-ban sa {rate}% ng mga bagong pro draft.",
    metaList: "Malapit sa itaas ng listahan ng hero para sa Pos {position}.",
    counter:
      "Malakas ito laban kay {nemesis}, na tumatalo sa iyo sa mga {loss}% ng mga laro mo laban sa kanya ({games}).",
    stopAfterLosses:
      "Pagkatapos ng {streak} sunod-sunod na talo, nanalo ka sa {after}% ng {afterGames} ranked game na itinuloy mo, kumpara sa {baseline}% sa kabuuan ({baselineGames} laro).",
    reviewLoss:
      "Ang pinakahuli mong ranked na talo ({kills}/{deaths}/{assists}). Magdagdag ng note o ng tag na “reviewed” sa pahina ng laro para matsekan ito.",
    logMmr: {
      one: "Nag-log ka ng MMR pagkatapos ng {logged} sa huling 1 ranked session mo.",
      other: "Nag-log ka ng MMR pagkatapos ng {logged} sa huling {n} ranked session mo.",
    },
    logMmrBasic:
      "Kapag nag-log ka pagkatapos ng bawat session, makikita sa mga session mo ang totoong pagbabago ng MMR mo.",
  },
  progress: {
    heroGames: "{played} / {target} laro",
    kept: {
      one: "Nasunod sa nag-iisang session sa ngayon",
      other: "Nasunod sa lahat ng {n} session sa ngayon",
    },
    broken: "Itinuloy pagkatapos ng {streak} talo sa {broken} sa {sessions} session",
    noSessions: "Wala pang ranked session ngayong linggo",
    reviewed: "Nabalikan na",
    notReviewed: "Hindi pa nababalikan",
    sessionsLogged: "{logged} / {total} session ang na-log",
  },
  gaps: {
    tiltSample:
      "Imumungkahi ang paghinto pagkatapos matalo kapag may {min} ranked game ka na nilaro pagkatapos ng 2 sunod-sunod na talo (may {games} ka).",
    noRole: "Kailangan ng malinaw na role mula sa mga huling lane mo para sa mungkahing hero.",
    noHeroes: "Walang mungkahing hero para sa role mo sa ngayon.",
  },
};
