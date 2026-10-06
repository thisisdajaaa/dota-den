import type { MessageTree } from "../../translate";
import type { heroes as en } from "../en/heroes";

export const heroes: MessageTree<typeof en> = {
  title: "Mga hero",
  counts: {
    games: { one: "1 laro", other: "{n} laro" },
    heroes: { one: "1 hero", other: "{n} hero" },
    matches: { one: "1 match", other: "{n} match" },
    importedGames: { one: "1 na-import na laro", other: "{n} na-import na laro" },
    olderGames: { one: "1 mas lumang laro", other: "{n} mas lumang laro" },
    enemyHeroes: { one: "1 kalabang hero", other: "{n} kalabang hero" },
    alliedHeroes: { one: "1 kakamping hero", other: "{n} kakamping hero" },
    wins: { one: "1 panalo", other: "{n} panalo" },
    losses: { one: "1 talo", other: "{n} talo" },
  },
  tooFewToJudge: "kulang pa para masabi",
  unavailable: {
    laneData: {
      busy: "Maraming request ang OpenDota ngayon, kaya hindi ma-load ang lane data. Subukan ulit pagkalipas ng isang minuto.",
      down: "Hindi available ang lane data ngayon. Subukan ulit mamaya.",
    },
    publicHeroStats: {
      busy: "Maraming request ang OpenDota ngayon, kaya hindi ma-load ang public hero stats. Subukan ulit pagkalipas ng isang minuto.",
      down: "Hindi available ang public hero stats ngayon. Subukan ulit mamaya.",
    },
    itemData: {
      busy: "Maraming request ang OpenDota ngayon, kaya hindi ma-load ang item data. Subukan ulit pagkalipas ng isang minuto.",
      down: "Hindi available ang item data ngayon. Subukan ulit mamaya.",
    },
    matchups: {
      busy: "Maraming request ang OpenDota ngayon, kaya hindi ma-load ang matchups. Subukan ulit pagkalipas ng isang minuto.",
      down: "Hindi available ang matchups ngayon. Subukan ulit mamaya.",
    },
  },
  index: {
    kicker: "Mga hero",
    title: "Mga hero mo",
    description:
      "{heroes} sa {games} mo. Buksan ang isang hero para makita ang record, trend, matchups at items mo rito.",
    descriptionEmpty:
      "Lalabas dito ang mga hero na nilalaro mo kapag na-import na ang mga match mo.",
    emptyTitle: "Wala pang hero",
    emptyBefore: "Wala pa kaming na-import na match mo. Sinisimulan ng iyong",
    emptyLink: "overview",
    emptyAfter: "ang import.",
    loading: "Nilo-load ang mga hero",
    loadingSuggestions: "Nilo-load ang mga mungkahing hero",
    loadingLanes: "Nilo-load kung saan ka naglalaro",
    error: "May nangyaring mali sa pag-load ng mga hero mo",
  },
  grid: {
    label: "Mga hero na nalaro mo na",
    cardLabel: "{name}: {games}, {rate} win rate",
  },
  banner: {
    label: "Hero",
    kicker: "Hero mo",
    detailsUnavailable: "Hindi available ang detalye ng hero",
    allMatches: "Lahat ng {matches} gamit si {name}",
    proGuide: "Pro guide para kay {name}",
  },
  trend: {
    kicker: "Sa paglipas ng panahon",
    title: "Trend ng win rate",
    byPatch: "Ang win rate mo gamit si {hero}, hinati ayon sa patch.",
    byMonth:
      "Ang win rate mo gamit si {hero}, hinati ayon sa buwan. Hinahati lang namin ayon sa patch kapag sakop ng mga laro mo ang hindi bababa sa dalawang patch at alam ang patch ng karamihan sa kanila.",
    faded: "Ang malalabong bar ay may wala pang {n} laro: kulang pa para masabi. ",
    noPatch: "Hindi isinama ang {games} na walang kilalang patch. ",
    older: "Hindi ipinapakita ang {games}.",
    empty: "Wala pang laro na maipapakita.",
    byPatchLabel: "Ayon sa patch",
    byMonthLabel: "Ayon sa buwan",
    barTitle: "{label}: {rate} sa {games}",
  },
  highRank: {
    kicker: "Public na laro",
    title: "High-rank win rate",
    footer: "Pinagsama ang Ancient, Divine at Immortal sa public high-rank games (OpenDota).",
    over: "sa {games} public high-rank na laro gamit si {hero}",
    tooFew: "May {games} ka gamit si {hero}: kulang pa para maikumpara (kailangan ng {min}+).",
    above: "Mas mataas ka nang {delta} points diyan.",
    below: "Mas mababa ka nang {delta} points diyan.",
    none: "Walang public high-rank na laro gamit si {name} na maikukumpara.",
  },
  matchups: {
    kicker: "Matchups",
    title: "Sino ang tinatalo mo at sino ang tumatalo sa iyo gamit si {hero}",
    footer:
      "Mula sa {games} mo gamit si {hero} sa OpenDota. Hindi isinama ang mga hero na nakaharap mo nang wala pang {min} laro ({enemies}, {allies}).",
    beat: "Tinatalo mo",
    loseTo: "Tumatalo sa iyo",
    winWith: "Panalo ka kasama",
    emptyBeat:
      "Walang kalabang hero na may {min}+ laro kung saan panalo ka sa kalahati o higit pa.",
    emptyLoseTo: "Walang kalabang hero na may {min}+ laro kung saan mas madalas kang talo.",
    emptyWinWith:
      "Walang kakamping hero na may {min}+ laro kung saan panalo ka sa kalahati o higit pa.",
  },
  items: {
    kicker: "Items",
    title: "Mga pinakamadalas mong bilhing item",
    footer:
      "Mula sa {withData} na may purchase data (parsed replays) sa huling {sample} mo gamit si {hero}. Hindi isinama ang consumables, recipes at murang components.",
    noNames:
      "Hindi available ang mga pangalan ng item ngayon, kaya hindi namin mailista ang items.",
    notEnough:
      "{games} lang gamit si {hero} ang may purchase data. Lalabas ang item stats kapag may parsed replay na ang hindi bababa sa {min} laro mo.",
    none: "Walang kapansin-pansing item sa mga laro mong may purchase data.",
    listLabel: "Mga pinakamadalas bilhing item",
    ofGames: "ng mga laro · {games} sa {total}",
  },
  build: {
    kicker: "Items",
    title: "Ang build mo laban sa mga pro",
    description:
      "Ang mga item na pinakamadalas bilhin ng mga pro kay {hero}, ayon sa rank, at kung gaano mo kadalas binibili ang bawat isa (sa {games} laro mong may purchase data).",
    footer:
      "Binibigay ng OpenDota ang bilang ng pro purchases nang walang bilang ng laro, kaya rank ang ipinapakita para sa mga pro, hindi porsyento.",
    proRankMid: "#{rank} na mid game item ng mga pro",
    proRankLate: "#{rank} na late game item ng mga pro",
    you: "Ikaw: {pct}%",
    rarely: "bihira",
  },
  progress: {
    kicker: "Progreso",
    title: "Gumagaling ka ba gamit si {hero}?",
    description:
      "Ang huling {half} laro mo laban sa {half} bago nito (mula sa {games} pinakabago mo gamit si {hero}). Ang mga linya ay 5-game rolling average.",
    footer:
      "Nagbabago ang per-minute stats depende sa role at haba ng laro, kaya puwedeng galing ang pagbabago sa paglalaro ng ibang position.",
    points: "{v} pts",
    stats: {
      gpm: "Gold kada minuto",
      xpm: "XP kada minuto",
      lhpm: "Last hits kada minuto",
      kda: "KDA ratio",
      winRate: "Win rate",
    },
  },
  lanes: {
    kicker: "Lanes at roles",
    title: "Kung saan ka naglalaro",
    sampleLast: "Ang huling {games} mo sa nakaraang {days} araw",
    samplePlaced: "{n} ang nailagay sa isang position",
    sampleNoLane: "{games} na walang lane data",
    sampleUnplaced: "{games} na hindi mabasa ang position",
    sampleSource:
      "Galing ang mga position sa lane data ng OpenDota (parsed replays) at sa roles ng hero.",
    noPublicGames: "Walang public na laro sa nakaraang {days} araw.",
    noLaneData:
      "Wala pang lane data ang mga bago mong laro. Alam lang ng OpenDota ang lanes para sa parsed replays.",
    listLabel: "Mga position",
    placedShare: "{pct}% ng mga nailagay na laro",
    noGames: "Walang laro",
    heroesAs: "Mga hero bilang {pos}",
    faded: "Malabo ang win rate na wala pang {n} laro: kulang pa para masabi.",
  },
  detail: {
    notFoundTitle: "Hindi nahanap ang hero",
    title: "Ikaw gamit si {name}",
    loading: "Nilo-load ang hero",
    back: "Lahat ng hero",
    noGamesTitle: "Wala ka pang laro gamit si {name}",
    noGamesBody:
      "Wala sa mga na-import mong match ang gamit si {name}. Maglaro ng ilan at lalabas sila rito.",
    loadingPublic: "Nilo-load ang public win rate",
    loadingProgress: "Nilo-load ang progreso mo",
    loadingItems: "Nilo-load ang items",
    loadingMatchups: "Nilo-load ang matchups",
    recordLabel: "Ang record mo",
    winRate: "Win rate",
    games: "Mga laro",
    lastPlayed: "Huling nilaro {ago}",
    kda: "KDA ratio",
    averages: "Avg {kills} kills · {deaths} deaths · {assists} assists",
    noFarm: "Wala pang farm data para sa hero na ito",
    farmUnavailable: "Hindi available ngayon",
    farmDetail: "Average sa huling {games} mo gamit ang hero na ito",
    matchHistory: "Match history",
    recentOn: "Mga bagong match gamit si {name}",
    viewAll: "Tingnan lahat ng {matches}",
  },
  notFound: {
    title: "Hindi nahanap ang hero",
    body: "Walang Dota hero na may ganyang ID. Pumili na lang ng isa sa mga hero mo.",
    back: "Bumalik sa mga hero mo",
  },
};
