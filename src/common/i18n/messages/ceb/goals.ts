import type { MessageTree } from "../../translate";
import type { goals as en } from "../en/goals";

export const goals: MessageTree<typeof en> = {
  title: "Mga goal karong semanaha",
  lastDay: "Katapusang adlaw sa semana",
  daysLeft: {
    one: "1 ka adlaw na lang karong semanaha",
    other: "{n} ka adlaw na lang karong semanaha",
  },
  edit: "I-edit",
  setGoals: "Paghimo og goal",
  addGoal: "Pagdugang og goal",
  saving: "Gi-save…",
  save: "I-save ang mga goal",
  cancel: "Kanselahon",
  empty:
    "Pagpili og hangtod {max} ka butang nga imong pagtutokan karong semanaha: win rate, mas mubong mga session, pag-log sa imong MMR, o hero nga imong praktisan. Ang pag-uswag gikan sa imong kaugalingong mga duwa.",
  notDone: "Wala pa nahuman",
  markDone: "Markahi nga nahuman",
  lastWeek: "Miaging semana",
  met: "naabot",
  missed: "wala maabot",
  saveFailed: "Dili ma-save ang imong mga goal.",
  status: { onTrack: "Sakto ang dagan", offTrack: "Nasalaag na", inProgress: "Padayon pa" },
  presets: {
    winRate: "Win rate",
    maxPerSession: "Mubong mga session",
    logAfterSessions: "Mo-log og MMR human sa session",
    heroGames: "Pagdula og hero sa ranked",
    custom: "Imong kaugalingon",
  },
  editor: {
    type: "Klase sa goal {n}",
    atLeast: "labing menos",
    atMost: "labing daghan",
    gamesEach: "ka duwa matag usa",
    hero: "Hero",
    times: "ka beses",
    yourGoal: "Imong goal",
    customPlaceholder: "pananglitan Mopalit og ward matag duwa",
    remove: "Tangtanga ang goal {n}",
  },
  describe: {
    winRate: "Modaog sa labing menos {target}% sa mga ranked game",
    maxPerSession: {
      one: "Magdula og dili molapas sa 1 ka ranked game matag session",
      other: "Magdula og dili molapas sa {n} ka ranked game matag session",
    },
    logAfterSessions: "I-log ang imong MMR human sa matag session",
    heroGames: {
      one: "Idula si {hero} sa ranked sa makausa",
      other: "Idula si {hero} sa {n} ka ranked nga duwa",
    },
  },
  progress: {
    needGames: "{games} / {min} ka duwa sa dili pa maihap",
    winRate: "{rate}% ({wins}–{losses})",
    longestSession: "Pinakataas nga session: {games}",
    noSessions: "Wala pay session",
    sessionsLogged: "{logged} / {total} ka session ang na-log",
    heroGames: "{played} / {target} ka ranked nga duwa",
    done: "Nahuman na",
    notYet: "Wala pa",
  },
};
