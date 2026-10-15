import type { MessageTree } from "../../translate";
import type { shares as en } from "../en/shares";

/** Filipino. */
export const shares: MessageTree<typeof en> = {
  record: "{wins}W {losses}L",
  aPlayer: "Isang player",
  games: { one: "1 laro", other: "{n} laro" },
  session: {
    title: "Session ni {who}: {record}",
    kicker: "Session · {date}",
    best: "Pinakamagandang laro",
  },
  week: {
    title: "Linggo ni {who}: {record}",
    kicker: "Linggo · {date}",
    mostPlayed: "Pinakamadalas laruin",
    best: "Pinakamagaling na hero",
  },
  summary: "Buod",
  wins: "Panalo",
  losses: "Talo",
  winRate: "Win rate",
  heroes: "Mga hero",
  played: "Nilaro",
  cta: {
    text: "Subaybayan ang sarili mong mga session, MMR at draft gamit ang Dota Den. Mag-sign in gamit ang Steam; walang kailangang i-install.",
    action: "Subukan ang Dota Den",
  },
  notFound: {
    title: "Hindi gumagana ang link na ito",
    body: "Tinanggal ito ng may-ari, o hindi ito kailanman umiral.",
  },
  button: {
    label: "I-share",
    copied: "Nakopya ang link",
    ready: "Handa na ang share link",
    failed: "Hindi makagawa ng share link.",
  },
  account: {
    title: "Mga ibinahaging link",
    description:
      "Mga link na ginawa mo gamit ang Share. Bawat isa ay snapshot ng session, linggo o rank journey na iyon, hindi kailanman ang MMR mo. Kapag tinanggal, hindi na ito gagana.",
    none: "Wala ka pang ibinahagi.",
    sessionLabel: "Session noong {date}",
    weekLabel: "Linggo ng {date}",
    journeyLabel: "Rank journey ({range})",
    remove: "Tanggalin",
    removeLabel: "Tanggalin ang link: {link}",
    removed: "Natanggal ang link. Hindi na ito gumagana.",
    removeFailed: "Hindi matanggal ang link.",
  },
  journey: {
    games: "Ranked record",
    chart: "Medal journey mula {from} hanggang {to}: {medals}.",
    title: "Rank journey ni {who}",
    kicker: "Rank journey · {date}",
    description: "{from} → {to}, ayon sa medal",
    medals: "Mga medal",
    climb: "Pinakamagandang akyat",
    slide: "Pinakamasamang baba",
    stars: { one: "1 star", other: "{n} star" },
    noClimb: "Walang akyat ng medal sa saklaw na ito",
    noSlide: "Walang baba ng medal sa saklaw na ito",
    heroes: "Pinakamadalas laruin",
    medalOnly: "Medal lang: hindi kailanman ibinabahagi ang na-log na MMR.",
  },
};
