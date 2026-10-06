import type { MessageTree } from "../../translate";
import type { live as en } from "../en/live";

export const live: MessageTree<typeof en> = {
  title: "Mga live na laro",
  kicker: "Live",
  description:
    "Mga league at pro na laro na nangyayari ngayon, mula sa spectator feed ng laro (mga 15 minutong huli ang league games), at ang mga public na laro na may pinakamataas na MMR. Buksan ang isang laro para sa live na pagsusuri ng draft nito. Nagre-refresh kada 30 segundo.",
  unavailable: "Hindi available ang live feed ngayon. Subukan ulit pagkalipas ng isang minuto.",
  league: "Mga league na laro",
  noLeague: "Walang live na league game ngayon.",
  topPublic: "Mga public na laro na may pinakamataas na MMR",
  noPublic: "Wala pang naiulat ngayon.",
  leagueGame: "League game",
  publicGame: "Public na laro",
  versus: "{radiant} vs {dire}",
  lead: {
    even: "Pantay ang net worth",
    leads: "Lamang ang {side} nang {gold}k gold",
  },
  card: {
    averageMmr: "Average na MMR {mmr}",
    open: "{title}: buksan ang live na pagsusuri",
    notPicked: "Hindi pa napi-pick",
    anonymous: "Anonymous",
    picking: "Pumipili…",
    watching: "{n} nanonood",
    behind: " · {min} minutong huli ang feed",
  },
  game: {
    metaTitle: "Live na laro",
    allLive: "Lahat ng live na laro",
    gone: "Hindi na live ang larong ito",
    seeFinished: "Tingnan ang natapos na match",
    livePublic: "Live na public game",
    averageMmr: "Average na MMR {mmr}, ayon sa ulat ng laro.",
    now: "Ngayon",
    live: "Live",
    feedBehind: "{min} minutong huli ang feed sa laro",
    lineups: "Mga lineup",
    aheadAsDrafted: "Lamang ang {team}, gaya ng sinabi ng draft.",
    aheadDespite: "Lamang ang {team} kahit hindi pabor ang draft.",
    even: "Pantay pa ang laro sa ngayon.",
    draftPending:
      "Lalabas ang pagsusuri ng draft kapag naka-pick na ng limang hero ang dalawang team.",
  },
  watch: {
    title: "Panoorin",
    streams:
      "Mga live na Twitch stream na binabanggit sa title ang mga team na ito, ang league na ito o ang mga pro nito. Title lang ang tinitingnan namin, kaya baka ibang laro ang ipinapakita ng isang stream.",
    noStreams:
      "Walang live na Twitch stream na bumabanggit sa larong ito ngayon. Mag-search ka na lang.",
    searchOnly: "Maghanap ng broadcast sa Twitch o YouTube.",
    playerTitle: "{name} sa Twitch",
    open: "Buksan ang {name} sa Twitch",
    close: "Isara ang player",
    viewers: "· {n} nanonood · {lang}",
    watchHere: "Panoorin ang {name} dito",
    playing: "Pinapanood",
    watch: "Panoorin",
    searchTwitch: "Hanapin sa Twitch ang “{query}”",
    searchYouTube: "Hanapin sa YouTube live ang “{query}”",
    clientHint: "Sa Dota 2 client, nasa Watch → Live ang mga league game.",
  },
};
