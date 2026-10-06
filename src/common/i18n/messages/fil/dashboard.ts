import type { MessageTree } from "../../translate";
import type { dashboard as en } from "../en/dashboard";

export const dashboard: MessageTree<typeof en> = {
  title: "Dashboard",
  loading: "Nilo-load ang dashboard",
  showing: "Ipinapakita ang {shown} sa {total} mong laro",
  noneInView: "Walang laro sa view na ito. Subukan ang mas malawak na saklaw ng oras.",
  keyStats: "Pangunahing stats",
  winRate: "Win rate",
  soloWinRate: "Solo win rate",
  partyWinRate: "Party win rate",
  kdaRatio: "KDA ratio",
  wins: { one: "1 panalo", other: "{n} panalo" },
  losses: { one: "1 talo", other: "{n} talo" },
  soloGames: { one: "1 solo na laro", other: "{n} solo na laro" },
  partyGames: { one: "1 party na laro", other: "{n} party na laro" },
  tooFew: " · kulang pa para husgahan",
  averages: "Avg {kills} kills · {deaths} deaths · {assists} assists",
  empty: {
    first_sync: {
      title: "Tinatawag ang kasaysayan ng laro mo…",
      body: "Ini-import namin ang mga laro mo mula sa OpenDota. Kusang mag-a-update ang page na ito.",
    },
    fetching: {
      title: "Kinukuha ng OpenDota ang kasaysayan ng laro mo",
      body: "Hiniling namin sa OpenDota na kunin ang mga laro mo mula sa Steam. Kadalasan ilang minuto lang ito, minsan mas matagal kung marami kang laro. Puwede mong iwanang bukas ang page na ito: kusa itong titingin ulit.",
    },
    no_public_data: {
      title: "Wala pang nakitang public na laro",
      body: "Wala pa ring laro ang OpenDota para sa account na ito. Sa Dota 2, pumunta sa Settings → Options → Social at i-on ang “Expose Public Match Data”. Hinihiling namin sa OpenDota na kunin ulit ang kasaysayan mo kada ilang oras, at makukuha rin nito ang mga larong lalaruin mo mula ngayon.",
    },
  },
  lanes: {
    loading: "Nilo-load kung saan ka naglalaro",
    kicker: "Lanes at roles",
    title: "Kung saan ka naglalaro",
    rateLimited:
      "Maraming request sa OpenDota ngayon, kaya hindi ma-load ang lane data. Subukan ulit pagkalipas ng isang minuto.",
    unavailable: "Hindi available ang lane data ngayon. Subukan ulit maya-maya.",
    positions: "Mga hero sa bawat position",
  },
  teammates: {
    kicker: "Mga kakampi",
    title: "Sino ang kasama mong maglaro",
    label: "Mga kakampi",
    unavailable:
      "Hindi available ang stats ng mga kakampi ngayon. Hindi apektado ang iba pang bahagi ng buod mo; subukan ulit pagkalipas ng isang minuto.",
    empty:
      "Wala ka pang kakampi. Lalabas dito ang mga taong kasama mo sa mga public na laro. Puwede ka ring",
    trackFriend: "mag-track ng kaibigan",
    emptyEnd: ".",
  },
  patch: {
    loading: "Nilo-load ang binago ng pinakabagong patch para sa iyo",
    kicker: "Pinakabagong patch",
    title: "Ano ang nagbago para sa iyo",
    unavailable: "Hindi available ang pinakabagong patch notes ngayon.",
    patchKicker: "Patch {version}",
    changed: {
      one: "Binago ng {version} ang 1 hero na nilalaro mo",
      other: "Binago ng {version} ang {n} hero na nilalaro mo",
    },
    unchanged: "Hindi binago ng {version} ang mga hero na nilalaro mo",
    description:
      "Mga hero na nilalaro mo: 3+ ranked na laro sa huling 90 araw, o naka-star sa isang patch page.",
    seeAll: "Tingnan lahat ng {n} sa {version}",
    allOf: "Lahat ng {version}",
    heroLink: "Ano ang nagbago kay {hero} sa {version}",
    moreChanges: { one: "1 pang pagbabago", other: "{n} pang pagbabago" },
    noGamesSince: "walang ranked na laro mula noon",
    tooFewToCompare: "{before} bago, {after} mula noon (kulang pa para ikumpara)",
    compared: "({before} bago, {after} mula noon) · KDA",
  },
};
