import type { MessageTree } from "../../translate";
import type { live as en } from "../en/live";

export const live: MessageTree<typeof en> = {
  title: "Mga live nga duwa",
  kicker: "Live",
  description:
    "Mga league ug pro nga duwa nga nahitabo karon, gikan sa spectator feed sa duwa (mga 15 ka minuto nga ulahi ang league games), ug ang mga public nga duwa nga pinakataas og MMR. Ablihi ang usa ka duwa para sa live nga pagbasa sa draft niini. Mo-refresh matag 30 segundos.",
  unavailable: "Dili available ang live feed karon. Sulayi pag-usab human sa usa ka minuto.",
  league: "Mga league nga duwa",
  noLeague: "Walay live nga league game karon.",
  topPublic: "Mga public nga duwa nga pinakataas og MMR",
  noPublic: "Wala pay na-report karon.",
  leagueGame: "League game",
  publicGame: "Public nga duwa",
  versus: "{radiant} vs {dire}",
  lead: {
    even: "Patas ang net worth",
    leads: "Abante ang {side} og {gold}k gold",
  },
  card: {
    averageMmr: "Average nga MMR {mmr}",
    open: "{title}: ablihi ang live nga pagbasa",
    notPicked: "Wala pa ma-pick",
    anonymous: "Anonymous",
    picking: "Nagpili pa…",
    watching: "{n} ang nagtan-aw",
    behind: " · {min} ka minuto nga ulahi ang feed",
  },
  game: {
    metaTitle: "Live nga duwa",
    allLive: "Tanang live nga duwa",
    gone: "Dili na live kini nga duwa",
    seeFinished: "Tan-awa ang nahuman nga match",
    livePublic: "Live nga public game",
    averageMmr: "Average nga MMR {mmr}, sumala sa report sa duwa.",
    now: "Karon",
    live: "Live",
    feedBehind: "{min} ka minuto nga ulahi ang feed sa duwa",
    lineups: "Mga lineup",
    aheadAsDrafted: "Abante ang {team}, sama sa gisulti sa draft.",
    aheadDespite: "Abante ang {team} bisan pa sa draft.",
    even: "Patas pa ang duwa hangtod karon.",
    draftPending:
      "Mogawas ang pagbasa sa draft kung naka-pick na og lima ka hero ang duha ka team.",
  },
  watch: {
    title: "Tan-awa",
    streams:
      "Mga live nga Twitch stream nga naghisgot niini nga mga team, niini nga league o sa mga pro niini sa ilang title. Title ra among gitan-aw, busa basin lain nga duwa ang gipakita sa usa ka stream.",
    noStreams: "Walay live nga Twitch stream nga naghisgot niini nga duwa karon. Pangita na lang.",
    searchOnly: "Pangita og broadcast sa Twitch o YouTube.",
    playerTitle: "{name} sa Twitch",
    open: "Ablihi ang {name} sa Twitch",
    close: "Sirad-i ang player",
    viewers: "· {n} ang nagtan-aw · {lang}",
    watchHere: "Tan-awa ang {name} dinhi",
    playing: "Gipatugtog",
    watch: "Tan-awa",
    searchTwitch: "Pangitaa sa Twitch ang “{query}”",
    searchYouTube: "Pangitaa sa YouTube live ang “{query}”",
    clientHint: "Sa Dota 2 client, ang mga league game naa sa Watch → Live.",
  },
};
