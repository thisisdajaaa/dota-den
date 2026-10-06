import type { MessageTree } from "../../translate";
import type { meta as en } from "../en/meta";

export const meta: MessageTree<typeof en> = {
  title: "Meta",
  counts: {
    games: { one: "1 laro", other: "{n} laro" },
    otherGames: {
      one: "1 pang laro ang walang lane data at hindi binilang.",
      other: "{n} pang laro ang walang lane data at hindi binilang.",
    },
    proDrafts: { one: "1 pro draft", other: "{n} pro draft" },
    picks: { one: "1 pick", other: "{n} pick" },
    bans: { one: "1 ban", other: "{n} ban" },
  },
  unavailable: {
    heroStats: {
      busy: "Maraming request ang OpenDota ngayon, kaya hindi ma-load ang hero stats. Subukan ulit pagkalipas ng isang minuto.",
      down: "Hindi available ang hero stats ngayon. Subukan ulit mamaya.",
    },
    proLaneData: {
      busy: "Maraming request ang OpenDota ngayon, kaya hindi ma-load ang pro lane data. Subukan ulit pagkalipas ng isang minuto.",
      down: "Hindi available ang pro lane data ngayon. Subukan ulit mamaya.",
    },
  },
  page: {
    kicker: "Meta",
    title: "Ano ang malakas ngayon",
    description:
      "Ang mga hero at lane partner na pinakamagaling sa bawat role sa mga bagong high-rank na laro at tournament, kasama ang mga pagbabago sa patch na ito.",
    guides: "Mga hero guide",
    pickRole: "Anong role ang nilalaro mo?",
    loading: "Nilo-load ang meta",
    loadingTopHeroes: "Nilo-load ang mga top hero",
    loadingTips: "Nilo-load ang patch tips",
    loadingDuos: "Nilo-load ang lane duos",
  },
  patchLine: {
    none: "Wala pang na-import na patch notes.",
    unavailable: "Hindi available ang impormasyon ng patch ngayon.",
    latest: "Pinakabagong patch:",
    released:
      ", inilabas noong {date}. Sakop ng public stats ang mga bagong laro at puwedeng may kasamang ilan bago nito.",
  },
  yourRole: {
    title: "Ang role mo",
    unavailable:
      "Hindi available ang mga bago mong lane ngayon, kaya hindi namin masabi ang role mo. Pumili ng isa sa ibaba.",
    tooFewOne:
      "Hindi pa namin masabi ang role mo: {games} sa nakaraang {days} araw ang may lane data, at kailangan namin ng hindi bababa sa {min}. May lane data lang ang mga larong na-parse ng OpenDota. Pumili ng role sa ibaba.",
    tooFewOther:
      "Hindi pa namin masabi ang role mo: {games} sa nakaraang {days} araw ang may lane data, at kailangan namin ng hindi bababa sa {min}. May lane data lang ang mga larong na-parse ng OpenDota. Pumili ng role sa ibaba.",
    basedOn: "Batay sa huling {games} mo na may lane data (nakaraang {days} araw).",
    byPosition: "Mga laro ayon sa position",
    positionGames: "{pos}: {games}",
  },
  roles: {
    tabsLabel: "Position",
    you: "(ikaw)",
    chooseRole: "Piliin ang role mo",
    core: "Core",
    support: "Support",
  },
  topHeroes: {
    kicker: "Ngayon",
    title: "Mga top hero: {name}",
    titleShort: "Mga top hero",
    description:
      "Niranggo ayon sa win rate mula Ancient hanggang Immortal at sa lane na ito, na hinihila papuntang 50% ang maliliit na sample, kasama ang kaunting dagdag para sa mga hero na pinag-aagawan sa tournaments.",
    publicSource: "High-rank at lane stats: public na laro sa OpenDota, na-update {ago}.",
    proOk: "Tournaments: {drafts} sa nakaraang {days} araw, na-update {ago}.",
    proTooFew: "Tournaments: {drafts} lang sa nakaraang {days} araw, kulang para magamit.",
    proUnavailable: "Hindi available ang tournament data ngayon.",
    laneUnavailable:
      "Hindi available ang lane data ngayon, kaya hindi masuri ng listahang ito kung saang lane nilalaro ang bawat hero. Ginagamit na lang nito ang karaniwang role ng hero.",
    notEnough:
      "Kulang ang data para i-ranggo ang mga hero sa role na ito ngayon. Subukan ulit mamaya.",
    highRank: "win rate sa matataas na rank · {games}",
    laneRate: "win rate · {games} ({share} ng mga laro nito ay nasa lane na ito)",
    laneNoData: "{lane}: hindi available ang lane data",
    tournaments: "Tournaments: {picks} · {bans} sa {drafts} ({contest} pinag-agawan)",
    trendTitle:
      "Pagbabago sa bahagi ng public picks, huling 3 araw kumpara sa mas maaga ngayong linggo",
    rising: "Tumataas",
    falling: "Bumababa",
  },
  tips: {
    kicker: "Patch {version}",
    kickerShort: "Patch",
    title: "Patch tips",
    description: "Ano ang nagbago at ano ang gumagalaw para sa top {n} hero sa role na ito.",
    footerUnavailable:
      "Hindi available ang patch notes ngayon, kaya hindi kasama ang mga pagbabago sa patch.",
    footerNone: "Wala pang na-import na patch notes, kaya hindi kasama ang mga pagbabago sa patch.",
    footerOk:
      "Orihinal na salita ng Valve ang mga pagbabago sa patch; buksan ang patch page para sa buong notes.",
    empty:
      "Walang pagbabago sa patch, malaking pick trend o kapansin-pansing numero para sa mga hero na ito ngayon.",
    seeAll: "Tingnan lahat ng {n} pagbabago",
    seeNotes: "Tingnan ang patch notes",
    needStats:
      "Kailangan ng patch tips ang hero stats, na hindi available ngayon. Puwede mo pa ring",
    readNotes: "basahin ang patch notes",
    changed: "Binago sa {version}: {line}",
    rising:
      "Tumataas: {pct} na mas madalas i-pick sa public na laro sa huling 3 araw kaysa mas maaga ngayong linggo",
    falling:
      "Bumababa: {pct} na mas bihirang i-pick sa public na laro sa huling 3 araw kaysa mas maaga ngayong linggo",
    contested:
      "Pinag-aagawan sa tournaments: na-pick o na-ban sa {pct} ng {drafts} pro draft sa nakaraang {days} araw",
    lane: "Panalo sa {pct} ng {games} public na laro sa {lane}",
  },
  duos: {
    kicker: "Lane partners",
    title: "Pinakamalakas na lane duos",
    soloLane: "Solo lane ang mid, kaya walang lane duos na maipapakita.",
    description:
      "Dalawang hero mula sa iisang team na magkasama sa {lane}, sa mga pro match sa nakaraang {days} araw. Hindi isinama ang mga pares na wala pang 8 laro.",
    source: "Source: pro match database ng OpenDota, na-update {ago}.",
    empty: "Wala pang pares sa {lane} na may sapat na pro games.",
    rate: "{rate} win rate · {games}",
  },
};
