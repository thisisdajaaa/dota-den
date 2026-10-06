import type { MessageTree } from "../../translate";
import type { leaderboards as en } from "../en/leaderboards";

export const leaderboards: MessageTree<typeof en> = {
  boards: {
    drafts: "Mga draft game",
    challenges: "Mga draft challenge",
    rooms: "Mga friend room",
  },
  scopes: { friends: "Mga kaibigan", everyone: "Lahat" },
  periods: { week: "Ngayong linggo", all: "Lahat ng panahon" },
  rules: {
    drafts:
      "Niraranggo ayon sa natapos na draft laban sa AI captain o sa practice, saka ayon sa pinakamataas na draft score. Ang draft score ay ang report card score ng panig mo mula sa draft outlook (0–100, 50 ang karaniwan). Walang score ang mga practice draft, kung saan ikaw ang naglalaro sa dalawang panig.",
    challenges:
      "Niraranggo ayon sa tamang sagot (may gradong Good o Excellent), saka ayon sa pinakamahabang streak. Ang unang sagot mo lang sa bawat puzzle ang binibilang.",
    rooms:
      "Niraranggo ayon sa natapos na room draft, saka ayon sa panalo. Ang panalo at talo ay iniuulat mismo ng mga captain pagkatapos ng laro at hindi beripikado; ang mga draft na walang iniulat na resulta ay binibilang lang na nilaro.",
  },
  weekStarts: "Nagsisimula ang linggo tuwing Lunes 00:00 UTC.",
  units: {
    drafts: { one: "{n} draft", other: "{n} draft" },
    challenges: { one: "{n} tamang sagot", other: "{n} tamang sagot" },
    rooms: { one: "{n} room draft", other: "{n} room draft" },
    player: { one: "{n} player", other: "{n} player" },
    answer: { one: "1 sagot", other: "{n} sagot" },
  },
  cta: {
    drafts: "Magsimula ng draft",
    challenges: "Sumubok ng challenge",
    rooms: "Mag-draft kasama ang kaibigan",
  },
  stats: {
    drafts: "Mga draft",
    bestScore: "Pinakamataas na score",
    grade: "Grado {grade}",
    avgScore: "Average na score",
    correct: "Tama",
    bestStreak: "Pinakamahabang streak",
    accuracy: "Katumpakan",
    ofAnswers: "sa {answers}",
    wins: "Panalo",
    selfReported: "sariling ulat",
    losses: "Talo",
  },
  board: {
    label: "Leaderboard ng {board}",
    you: "Ikaw",
    rankUnknown: "Hindi alam ang ranggo",
    rowLabel: "Ranggo {rank}: {name}",
    rowLabelYou: "Ranggo {rank}: {name} (ikaw)",
    inviteBefore: "Mag-imbita ng kaibigan: gumawa ng room sa",
    inviteAfter:
      "at ipadala sa kanila ang link. Kapag nag-sign in at naglaro sila, lalabas sila rito.",
    nobody: "Wala pang naglaro.",
    nobodyWeek: "Wala pang naglaro ngayong linggo.",
    noAccountsTitle: "Wala pang Dota Den account ang mga kaibigan mo",
    noAccountsBody:
      "Ang mga kaibigan ay ang mga player na tina-track mo, ang mga kakampi mo sa OpenDota at ang mga naka-draft mo sa mga room, kapag nag-sign in na sila rito.",
    noAccounts: "Wala pang Dota Den account ang mga kaibigan mo.",
    friendsNotPlayed: "Wala pang naglaro sa mga kaibigan mo.",
    friendsNotPlayedWeek: "Wala pang naglaro sa mga kaibigan mo ngayong linggo.",
    friendsIncomplete:
      "Hindi ma-load ngayon ang ilan sa mga kaibigan mo (baka busy ang OpenDota), kaya baka may kulang sa board na ito.",
    yourPosition: "Ang puwesto mo",
    total: { one: "1 player sa board na ito.", other: "{n} player sa board na ito." },
    totalWeek: {
      one: "1 player sa board na ito ngayong linggo.",
      other: "{n} player sa board na ito ngayong linggo.",
    },
    notOnYet: "Wala ka pa rito.",
    notOnYetWeek: "Wala ka pa rito ngayong linggo.",
  },
  rankedWeek: {
    kicker: "Huling 7 araw",
    title: "Ranked ngayong linggo",
    description:
      "Ikaw at ang mga kaibigan mo (mga tina-track mong player, madalas na kakampi at kalaban sa room), ayon sa ranked na panalo bawas talo. Ang MMR ay tantiyang ±25 bawat laro: hindi ibinabahagi ng Valve ang totoong MMR.",
    empty: "Walang ranked na laro mula sa iyo o sa mga kaibigan mo sa huling 7 araw.",
    you: "(ikaw)",
    bestTitle: "Pinakamaganda ngayong linggo: {hero} {record}",
    idle: "{n} ang hindi naglaro ng ranked",
    unknown: "{n} ang hindi mabasa (private ang data o busy ang OpenDota)",
    friendsIncomplete: "hindi ma-load ang ilang kaibigan",
  },
  standing: {
    kicker: "Leaderboards",
    title: "Ang puwesto mo sa mga kaibigan",
    label: "Ang puwesto mo",
    notPlayed: "Hindi pa naglaro",
    unavailable:
      "Hindi available ngayon ang puwesto mo. Hindi apektado ang iba pang bahagi ng buod mo.",
    loading: "Nilo-load ang puwesto mo",
  },
  visibility: {
    listed: "Nakalista ka na sa mga board na Lahat.",
    unlisted: "Hindi ka na nakalista nang public.",
    saveError: "Hindi ma-save iyan. Subukan ulit.",
    label: "Ipakita ako sa mga board na Lahat",
    help: "Naka-off bilang default. Makikita ka pa rin ng mga kaibigan mo sa mga board na Mga kaibigan.",
  },
  page: {
    title: "Leaderboards",
    kicker: "Makipagkumpitensya",
    description:
      "Tingnan kung sino ang pinakamaraming nag-draft sa mga kaibigan mo, o sa buong Dota Den. May sariling board ang mga draft game, draft challenge at friend room.",
    invite: "Mag-imbita ng kaibigan",
    loadingRanked: "Nilo-load ang ranked ngayong linggo",
    boardTabs: "Leaderboard",
    whoTabs: "Sino",
    whenTabs: "Kailan",
    everyoneNote:
      "Ang mga player lang na piniling mailista ang lalabas sa mga board na Lahat (lagi mong makikita ang sarili mong row).",
    unavailableTitle: "Hindi available ngayon ang leaderboard na ito",
    unavailableBody:
      "Pakisubukan ulit pagkalipas ng isang minuto. Sine-save pa rin ang mga draft at sagot mo.",
    loading: "Nilo-load ang leaderboard",
  },
};
