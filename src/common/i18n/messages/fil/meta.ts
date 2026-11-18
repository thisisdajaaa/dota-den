import type { MessageTree } from "../../translate";
import type { meta as en } from "../en/meta";

export const meta: MessageTree<typeof en> = {
  title: "Meta",
  titleBracket: "Meta: {bracket}",
  counts: {
    matches: { one: "1 match", other: "{n} match" },
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
  attribution: {
    label: "Data:",
    stratz: "STRATZ",
  },
  page: {
    kicker: "Meta",
    title: "Ano ang malakas ngayon",
    description:
      "Ang mga hero at lane partner na pinakamagaling sa bawat role sa mga bagong high-rank na laro at tournament, kasama ang mga pagbabago sa patch na ito.",
    descriptionBracket:
      "Ang mga hero na pinakamagaling sa bawat role sa mga public na laro sa {bracket}, kasama ang mga pagbabago sa patch na ito. Galing pa rin sa mga pro match ang lane duos at tournament picks.",
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
  bracket: {
    title: "Rank bracket",
    label: "Rank bracket",
    you: "(ikaw)",
    highRanks: "Matataas na rank: {range}",
    yours: "Ipinapakita ang bracket mo: {bracket}.",
    showing: "Ipinapakita ang {bracket}.",
    defaultNote:
      "Mga high-rank na laro ito, gaya ng ipinapakita ng karamihan ng stats site. Puwedeng iba ang mga hero na nananalo sa medal mo, kaya piliin ang bracket mo.",
    note: "Galing lang ang win rates sa mga public na ranked game sa mga medal na ito, hindi sa pro o high-rank na laro.",
    showYours: "Ipakita ang bracket mo ({bracket})",
  },
  bracketSource: {
    rates:
      "Win rates sa {bracket}: public na ranked game sa OpenDota ({matches}), na-update {ago}.",
    placedPositions:
      "Kung sino ang naglalaro sa bawat posisyon ay galing sa mga larong Ancient–Immortal sa STRATZ, {range}, hindi sa bracket na ito.",
    placedLanes:
      "Kung sino ang naglalaro sa bawat posisyon ay galing sa lane data ng OpenDota (public na na-parse na laro sa lahat ng rank) at sa role ng hero, hindi sa bracket na ito.",
    trends: "Pick trends: public na laro sa OpenDota sa lahat ng rank.",
    noPro: "Hindi binibilang ang tournament picks sa bracket rankings.",
    emptyMedals:
      "Walang larong {empty} sa data ng OpenDota ngayon, kaya galing lang sa mga larong {rest} ang mga numerong ito.",
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
    kickerBracket: "Mga larong {bracket}",
    bracketScope: "{pos}, public na laro sa {bracket}",
    descriptionBracket:
      "Niranggo ayon sa win rate sa mga larong {bracket} (lahat ng posisyon), na hinihila papuntang 50% ang maliliit na sample. Kailangan ng hero ng {games} o higit pang laro sa bracket para mailista.",
    bracketRate: "win rate sa {bracket} · {games}",
    bracketPickRate: "na-pick sa {pct} ng mga match",
    bracketPlacedAt: "Nilalaro bilang {pos} sa {share} ng mga larong Ancient–Immortal nito",
    bracketPlacedLane: "{share} ng mga public na laro nito ay nasa {lane}",
    titleShort: "Mga top hero",
    description:
      "Niranggo ayon sa win rate mula Ancient hanggang Immortal at sa lane na ito, na hinihila papuntang 50% ang maliliit na sample, kasama ang kaunting dagdag para sa mga hero na pinag-aagawan sa tournaments.",
    descriptionPositions:
      "Inayos ayon sa win rate sa posisyong ito sa mga larong Ancient hanggang Immortal, na hinihila papunta sa 50% ang maliliit na sample, at may kaunting dagdag para sa mga hero na pinag-aagawan sa tournaments. Kasama ang hero kapag hindi bababa sa {share} ng mga laro nito, at {games} o higit pa, ay nasa posisyong ito.",
    positionsSource:
      "Position stats: public na laro sa STRATZ, Ancient–Immortal, {range} ({days} araw), na-update {ago}.",
    trendSource: "Pick trends: public na laro sa OpenDota, na-update {ago}.",
    trendUnavailable: "Hindi available ang pick trends (OpenDota) ngayon.",
    positionsFallback:
      "Hindi available ang position stats ng STRATZ ngayon, kaya inilalagay ng listahang ito ang mga hero ayon sa lane data ng OpenDota at sa role ng hero.",
    positionRate: "win rate sa {pos} · {games} ({share} ng mga laro nito)",
    positionScope: "{pos}, Ancient–Immortal, {range}",
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
    position: "Panalo sa {pct} ng {games} na larong Ancient–Immortal sa {pos}",
    bracket: "Panalo sa {pct} ng {games} na larong {bracket}",
  },
  overview: {
    kicker: "Mabilisang tingin",
    title: "Pinakamalakas na hero ngayon",
    description:
      "Ang pinakamahuhusay na hero sa Ancient hanggang Immortal para sa bawat uri ng role, ayon sa kung saan talaga sila nilalaro. Pumili ng role sa itaas para sa buong ranking na may tournament.",
    titleBracket: "Pinakamalakas na hero sa {bracket}",
    descriptionBracket:
      "Ang pinakamahuhusay na hero sa mga public na laro sa {bracket} para sa bawat uri ng role, ayon sa kung saan talaga sila nilalaro. Pumili ng role sa itaas para sa buong ranking.",
    bracketGames: "{games} sa {bracket}",
    onceEach:
      "Isang beses lang lumalabas ang bawat hero, sa role kung saan siya pinakamadalas laruin.",
    loading: "Nilo-load ang overview ng meta",
    pools: {
      carry: "Mga carry",
      core: "Mid at offlane",
      support: "Mga support",
    },
    poolsAria: "Mga top hero: {name}",
    winRate: "{rate} win rate",
    winRateAt: "{rate} win rate sa {pos}",
    positionGames: "{games} · {share} ng mga laro nito",
    sourcePositions:
      "Source: public na laro sa STRATZ, Ancient–Immortal, {range}, na-update {ago}. Isang beses lang nakalista ang bawat hero, sa grupo ng posisyon kung saan ito pinakamadalas laruin. Bahagyang binabago ng tournament picks at pick trends (OpenDota) ang pagkakasunod.",
    fullRanking: "Buong ranking:",
    source:
      "Galing sa mga high-rank na laro at lane data ng OpenDota, na-update {ago}. Isang beses lang lumalabas ang bawat hero, sa role kung saan siya pinakamadalas laruin.",
    empty: "Kulang pa ang data para sa grupong ito ngayon.",
    contested: {
      kicker: "Mga tournament",
      title: "Pinakapinag-aagawan",
      pickBan: "{picks} · {bans}",
      contest: "{pct} ng mga draft",
      source: "Na-pick o na-ban sa {drafts} sa nakaraang {days} araw, na-update {ago}.",
      tooFew:
        "{drafts} lang sa nakaraang {days} araw, kulang para masabi kung alin ang pinag-aagawan.",
      unavailable: "Hindi available ang tournament data ngayon.",
    },
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
