import type { MessageTree } from "../../translate";
import type { shares as en } from "../en/shares";

/** Cebuano. */
export const shares: MessageTree<typeof en> = {
  record: "{wins}W {losses}L",
  aPlayer: "Usa ka player",
  games: { one: "1 ka duwa", other: "{n} ka duwa" },
  session: {
    title: "Session ni {who}: {record}",
    kicker: "Session · {date}",
    best: "Labing nindot nga duwa",
  },
  week: {
    title: "Semana ni {who}: {record}",
    kicker: "Semana · {date}",
    mostPlayed: "Kanunay gidula",
    best: "Labing maayo nga hero",
  },
  summary: "Sumaryo",
  wins: "Daog",
  losses: "Pildi",
  winRate: "Win rate",
  heroes: "Mga hero",
  played: "Gidula",
  cta: {
    text: "Bantayi ang imong kaugalingong mga session, MMR ug draft gamit ang Dota Den. Mag-sign in gamit ang Steam; walay i-install.",
    action: "Sulayi ang Dota Den",
  },
  notFound: {
    title: "Dili molihok kining link",
    body: "Gitangtang kini sa tag-iya, o wala gyud kini.",
  },
  button: {
    label: "I-share",
    copied: "Nakopya ang link",
    ready: "Andam na ang share link",
    failed: "Dili makahimo og share link.",
  },
  account: {
    title: "Mga gipaambit nga link",
    description:
      "Mga link nga imong gihimo gamit ang Share. Matag usa snapshot sa maong session o semana, dili gyud ang imong MMR. Kung tangtangon, dili na kini molihok.",
    none: "Wala ka pay gipaambit.",
    sessionLabel: "Session niadtong {date}",
    weekLabel: "Semana sa {date}",
    remove: "Tangtanga",
    removeLabel: "Tangtanga ang link: {link}",
    removed: "Natangtang ang link. Dili na kini molihok.",
    removeFailed: "Dili matangtang ang link.",
  },
};
