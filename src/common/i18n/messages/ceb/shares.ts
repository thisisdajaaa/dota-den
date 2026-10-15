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
      "Mga link nga imong gihimo gamit ang Share. Matag usa snapshot sa maong session, semana o rank journey, dili gyud ang imong MMR. Kung tangtangon, dili na kini molihok.",
    none: "Wala ka pay gipaambit.",
    sessionLabel: "Session niadtong {date}",
    weekLabel: "Semana sa {date}",
    journeyLabel: "Rank journey ({range})",
    remove: "Tangtanga",
    removeLabel: "Tangtanga ang link: {link}",
    removed: "Natangtang ang link. Dili na kini molihok.",
    removeFailed: "Dili matangtang ang link.",
  },
  journey: {
    games: "Ranked record",
    chart: "Medal journey gikan {from} hangtod {to}: {medals}.",
    title: "Rank journey ni {who}",
    kicker: "Rank journey · {date}",
    description: "{from} → {to}, sumala sa medal",
    medals: "Mga medal",
    climb: "Labing maayong pagsaka",
    slide: "Labing grabe nga pagkanaog",
    stars: { one: "1 ka star", other: "{n} ka star" },
    noClimb: "Walay pagsaka sa medal niini nga sakop",
    noSlide: "Walay pagkanaog sa medal niini nga sakop",
    heroes: "Kanunay gidula",
    medalOnly: "Medal ra: dili gyud gipaambit ang gi-log nga MMR.",
  },
};
