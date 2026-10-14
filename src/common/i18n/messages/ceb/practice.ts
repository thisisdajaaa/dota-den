import type { MessageTree } from "../../translate";
import type { practice as en } from "../en/practice";

export const practice: MessageTree<typeof en> = {
  title: "Plano sa pagpraktis",
  kicker: "Karong semanaha",
  basic: "Kulang pa ang data para sa personal nga plano, mao nga ania una ang mga basic.",
  empty: "Wala nay nahabilin nga lakang karong semanaha. Adunay bag-ong plano sa sunod semana.",
  swap: "Ilisi ang lakang {n}",
  dismiss: "Tangtanga ang lakang {n}",
  updateFailed: "Dili mausab ang imong plano.",
  openMatch: "Ablihi ang duwa",
  status: { done: "Nahuman na", broken: "Naguba karong semanaha", open: "Padayon pa" },
  step: {
    practiceHero: "Duwaa si {hero} sa {target} ka ranked nga duwa",
    stopAfterLosses: "Hunonga ang session human sa {streak} ka sunod-sunod nga pildi",
    reviewLoss: "Balikan ang imong pildi isip {hero} niadtong {date}",
    logMmr: "I-log ang imong MMR human sa matag session",
  },
  why: {
    highRank: "{rate}% win rate sa tag-as nga rank isip Pos {position} ({games} ka duwa).",
    contest: "Gipili o gi-ban sa {rate}% sa bag-ong mga pro draft.",
    metaList: "Duol sa ibabaw sa listahan sa hero para sa Pos {position}.",
    counter:
      "Kusog kini batok kang {nemesis}, nga nagpildi nimo sa mga {loss}% sa imong mga duwa batok niya ({games} ka duwa).",
    stopAfterLosses:
      "Human sa {streak} ka sunod-sunod nga pildi, nidaog ka sa {after}% sa {afterGames} ka ranked nga duwa nga imong gipadayon, batok sa {baseline}% sa kinatibuk-an ({baselineGames} ka duwa).",
    reviewLoss:
      "Ang imong pinakaulahing ranked nga pildi ({kills}/{deaths}/{assists}). Pagdugang og note o sa tag nga “reviewed” sa panid sa duwa aron matsekan kini.",
    logMmr:
      "Nag-log ka og MMR human sa {logged} sa imong ulahing {sessions} ka ranked nga session.",
    logMmrBasic:
      "Kung mag-log ka human sa matag session, makita sa imong mga session ang tinuod nga kausaban sa imong MMR.",
  },
  progress: {
    heroGames: "{played} / {target} ka duwa",
    kept: "Nasunod sa tanang {sessions} ka session hangtod karon",
    broken: "Gipadayon human sa {streak} ka pildi sa {broken} sa {sessions} ka session",
    noSessions: "Wala pay ranked nga session karong semanaha",
    reviewed: "Nabalikan na",
    notReviewed: "Wala pa nabalikan",
    sessionsLogged: "{logged} / {total} ka session ang na-log",
  },
  gaps: {
    tiltSample:
      "Isugyot ang paghunong human sa pildi kung aduna nay {min} ka ranked nga duwa nga imong gidula human sa 2 ka sunod-sunod nga pildi (aduna kay {games}).",
    noRole: "Kinahanglan og klarong role gikan sa imong ulahing mga lane para sa sugyot nga hero.",
    noHeroes: "Walay sugyot nga hero para sa imong role karon.",
  },
};
