import type { MessageTree } from "../../translate";
import type { heroes as en } from "../en/heroes";

export const heroes: MessageTree<typeof en> = {
  title: "Mga hero",
  counts: {
    games: { one: "1 ka duwa", other: "{n} ka duwa" },
    heroes: { one: "1 ka hero", other: "{n} ka hero" },
    matches: { one: "1 ka match", other: "{n} ka match" },
    importedGames: { one: "1 ka na-import nga duwa", other: "{n} ka na-import nga duwa" },
    olderGames: { one: "1 ka mas karaang duwa", other: "{n} ka mas karaang duwa" },
    enemyHeroes: { one: "1 ka kaaway nga hero", other: "{n} ka kaaway nga hero" },
    alliedHeroes: { one: "1 ka kauban nga hero", other: "{n} ka kauban nga hero" },
    wins: { one: "1 ka daog", other: "{n} ka daog" },
    losses: { one: "1 ka pildi", other: "{n} ka pildi" },
  },
  tooFewToJudge: "kulang pa aron mahibal-an",
  unavailable: {
    laneData: {
      busy: "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang lane data. Sulayi pag-usab human sa usa ka minuto.",
      down: "Dili available ang lane data karon. Sulayi pag-usab unya.",
    },
    publicHeroStats: {
      busy: "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang public hero stats. Sulayi pag-usab human sa usa ka minuto.",
      down: "Dili available ang public hero stats karon. Sulayi pag-usab unya.",
    },
    itemData: {
      busy: "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang item data. Sulayi pag-usab human sa usa ka minuto.",
      down: "Dili available ang item data karon. Sulayi pag-usab unya.",
    },
    matchups: {
      busy: "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang matchups. Sulayi pag-usab human sa usa ka minuto.",
      down: "Dili available ang matchups karon. Sulayi pag-usab unya.",
    },
  },
  index: {
    kicker: "Mga hero",
    title: "Imong mga hero",
    description:
      "{heroes} sa imong {games}. Ablihi ang usa ka hero aron makita ang imong record, trend, matchups ug items niini.",
    descriptionEmpty:
      "Mogawas diri ang mga hero nga imong gidula kung na-import na ang imong mga match.",
    emptyTitle: "Wala pay hero",
    emptyBefore: "Wala pa mi naka-import sa imong mga match. Ang imong",
    emptyLink: "overview",
    emptyAfter: "ang magsugod sa import.",
    loading: "Gi-load ang mga hero",
    loadingSuggestions: "Gi-load ang mga gisugyot nga hero",
    loadingLanes: "Gi-load kung asa ka nagdula",
    error: "Naay sayop sa pag-load sa imong mga hero",
  },
  grid: {
    label: "Mga hero nga imong nadula na",
    cardLabel: "{name}: {games}, {rate} win rate",
  },
  banner: {
    label: "Hero",
    kicker: "Imong hero",
    detailsUnavailable: "Dili available ang detalye sa hero",
    allMatches: "Tanang {matches} gamit si {name}",
    proGuide: "Pro guide para kang {name}",
  },
  trend: {
    kicker: "Sa paglabay sa panahon",
    title: "Trend sa win rate",
    byPatch: "Imong win rate gamit si {hero}, gibahin sumala sa patch.",
    byMonth:
      "Imong win rate gamit si {hero}, gibahin sumala sa bulan. Gibahin ra namo sumala sa patch kung ang imong mga duwa naglangkob sa labing menos duha ka patch ug nahibal-an ang patch sa kadaghanan niini.",
    faded: "Ang mga luspad nga bar kulang pa sa {n} ka duwa: kulang pa aron mahibal-an. ",
    noPatch: "Wala giapil ang {games} nga walay nahibal-ang patch. ",
    older: "Wala gipakita ang {games}.",
    empty: "Wala pay duwa nga ikapakita.",
    byPatchLabel: "Sumala sa patch",
    byMonthLabel: "Sumala sa bulan",
    barTitle: "{label}: {rate} sa {games}",
  },
  highRank: {
    kicker: "Public nga duwa",
    title: "High-rank win rate",
    footer: "Gihiusa ang Ancient, Divine ug Immortal sa public high-rank games (OpenDota).",
    over: "sa {games} ka public high-rank nga duwa gamit si {hero}",
    tooFew: "Naa kay {games} gamit si {hero}: kulang pa aron ikumpara (kinahanglan og {min}+).",
    above: "Mas taas ka og {delta} points niana.",
    below: "Mas ubos ka og {delta} points niana.",
    none: "Walay public high-rank nga duwa gamit si {name} nga ikumpara.",
  },
  matchups: {
    kicker: "Matchups",
    title: "Kinsa imong gidaog ug kinsa ang nakapildi nimo gamit si {hero}",
    footer:
      "Gikan sa imong {games} gamit si {hero} sa OpenDota. Wala giapil ang mga hero nga imong naatubang og kulang sa {min} ka duwa ({enemies}, {allies}).",
    beat: "Imong gidaog",
    loseTo: "Nakapildi nimo",
    winWith: "Modaog ka kauban",
    emptyBeat:
      "Walay kaaway nga hero nga adunay {min}+ ka duwa diin modaog ka sa katunga o labaw pa.",
    emptyLoseTo: "Walay kaaway nga hero nga adunay {min}+ ka duwa diin mas kanunay kang mapildi.",
    emptyWinWith:
      "Walay kauban nga hero nga adunay {min}+ ka duwa diin modaog ka sa katunga o labaw pa.",
  },
  items: {
    kicker: "Items",
    title: "Imong kanunay paliton nga mga item",
    footer:
      "Gikan sa {withData} nga adunay purchase data (parsed replays) sa imong katapusang {sample} gamit si {hero}. Wala giapil ang consumables, recipes ug barato nga components.",
    noNames: "Dili available ang mga ngalan sa item karon, mao nga dili namo malista ang items.",
    notEnough:
      "{games} ra gamit si {hero} ang adunay purchase data. Mogawas ang item stats kung adunay parsed replay ang labing menos {min} sa imong mga duwa.",
    none: "Walay talagsaong item sa imong mga duwa nga adunay purchase data.",
    listLabel: "Kanunay paliton nga mga item",
    ofGames: "sa mga duwa · {games} sa {total}",
  },
  build: {
    kicker: "Items",
    title: "Imong build batok sa mga pro",
    description:
      "Ang mga item nga kanunay paliton sa mga pro kang {hero}, sumala sa rank, ug unsa ka kanunay nimo kini paliton (sa {games} sa imong mga duwa nga adunay purchase data).",
    footer:
      "Ang OpenDota naghatag og ihap sa pro purchases nga walay ihap sa duwa, mao nga rank ang gipakita para sa mga pro, dili porsyento.",
    proRankMid: "#{rank} nga mid game item sa mga pro",
    proRankLate: "#{rank} nga late game item sa mga pro",
    you: "Ikaw: {pct}%",
    rarely: "talagsa ra",
  },
  progress: {
    kicker: "Pag-uswag",
    title: "Nag-uswag ba ka gamit si {hero}?",
    description:
      "Imong katapusang {half} ka duwa batok sa {half} sa wala pa niini (gikan sa imong {games} pinakabag-o gamit si {hero}). Ang mga linya kay 5-game rolling average.",
    footer:
      "Ang per-minute stats mausab depende sa role ug gitas-on sa duwa, mao nga ang kausaban mahimong gikan sa pagdula og laing position.",
    points: "{v} pts",
    stats: {
      gpm: "Gold matag minuto",
      xpm: "XP matag minuto",
      lhpm: "Last hits matag minuto",
      kda: "KDA ratio",
      winRate: "Win rate",
    },
  },
  lanes: {
    kicker: "Lanes ug roles",
    title: "Asa ka nagdula",
    sampleLast: "Imong katapusang {games} sa milabay nga {days} ka adlaw",
    samplePlaced: "{n} ang nabutang sa usa ka position",
    sampleNoLane: "{games} nga walay lane data",
    sampleUnplaced: "{games} nga dili mabasa ang position",
    sampleSource:
      "Ang mga position gikan sa lane data sa OpenDota (parsed replays) ug sa roles sa hero.",
    noPublicGames: "Walay public nga duwa sa milabay nga {days} ka adlaw.",
    noLaneData:
      "Wala pay lane data ang imong bag-ong mga duwa. Ang OpenDota nahibalo ra sa lanes para sa parsed replays.",
    listLabel: "Mga position",
    placedShare: "{pct}% sa nabutang nga mga duwa",
    noGames: "Walay duwa",
    heroesAs: "Mga hero isip {pos}",
    faded: "Luspad ang win rate nga kulang sa {n} ka duwa: kulang pa aron mahibal-an.",
  },
  detail: {
    notFoundTitle: "Wala makit-an ang hero",
    title: "Ikaw gamit si {name}",
    loading: "Gi-load ang hero",
    back: "Tanang hero",
    noGamesTitle: "Wala pa kay duwa gamit si {name}",
    noGamesBody:
      "Wala sa imong na-import nga mga match ang gamit si {name}. Pagdula og pipila ug mogawas sila diri.",
    loadingPublic: "Gi-load ang public win rate",
    loadingProgress: "Gi-load ang imong pag-uswag",
    loadingItems: "Gi-load ang items",
    loadingMatchups: "Gi-load ang matchups",
    recordLabel: "Imong record",
    winRate: "Win rate",
    games: "Mga duwa",
    lastPlayed: "Katapusang gidula {ago}",
    kda: "KDA ratio",
    averages: "Avg {kills} kills · {deaths} deaths · {assists} assists",
    noFarm: "Wala pay farm data para niining hero",
    farmUnavailable: "Dili available karon",
    farmDetail: "Average sa imong katapusang {games} gamit kining hero",
    matchHistory: "Match history",
    recentOn: "Bag-ong mga match gamit si {name}",
    viewAll: "Tan-awa ang tanang {matches}",
  },
  notFound: {
    title: "Wala makit-an ang hero",
    body: "Walay Dota hero nga adunay ingon ana nga ID. Pagpili na lang og usa sa imong mga hero.",
    back: "Balik sa imong mga hero",
  },
};
