import type { MessageTree } from "../../translate";
import type { heroes as en } from "../en/heroes";

export const heroes: MessageTree<typeof en> = {
  compare: {
    metaTitle: "Paano ka ikumpara",
    link: "Paano ka ikumpara",
    back: "Mga hero mo",
    kicker: "Mga hero mo",
    title: "Paano ka ikumpara",
    description:
      "Ang mga laro mo sa bawat hero laban sa mga player na kapareho mo ng rank sa parehong hero, sa parehong haba ng laro: kasing-farm, kasing-laban at kasing-buhay ka ba nila?",
    against: "Ikumpara sa",
    yourRank: "Rank mo",
    rankAbove: "Ang rank na mas mataas",
    summary: "Ang pinakamalaking kulang mo at ang pinakamalakas mo",
    workOn: "Pagbutihin",
    strength: "Lamang mo",
    gap: {
      lastHits: {
        better: "{hero}: mas marami ng {pct}% ang last hits mo kaysa sa mga {rank} player",
        worse: "{hero}: mas kaunti ng {pct}% ang last hits mo kaysa sa mga {rank} player",
      },
      fights: {
        better: "{hero}: mas marami ng {pct}% ang kills + assists mo kaysa sa mga {rank} player",
        worse: "{hero}: mas kaunti ng {pct}% ang kills + assists mo kaysa sa mga {rank} player",
      },
      deaths: {
        better: "{hero}: mas kaunti ng {pct}% ang deaths mo kaysa sa mga {rank} player",
        worse: "{hero}: mas marami ng {pct}% ang deaths mo kaysa sa mga {rank} player",
      },
    },
    numbers: "Ikaw {yours} · sila {theirs} (kada laro, parehong haba)",
    heroesTitle: "Laban sa mga {rank} player",
    games: { one: "1 laro", other: "{n} laro" },
    stats: { lastHits: "Last hits", fights: "Kills + assists", deaths: "Deaths" },
    brackets: {
      HERALD_GUARDIAN: "Herald–Guardian",
      CRUSADER_ARCHON: "Crusader–Archon",
      LEGEND_ANCIENT: "Legend–Ancient",
      DIVINE_IMMORTAL: "Divine–Immortal",
    },
    locked: {
      one: "Sa Plus, 1 pang hero mo ang makukumpara.",
      other: "Sa Plus, {n} pang hero mo ang makukumpara.",
    },
    seePlus: "Tingnan ang Plus",
    method:
      "Ang mga public game mo sa huling {days} araw (15 minuto o higit pa; mga hero na may 5+ laro), laban sa average ng huling buong linggo ng mga laro sa rank na iyon sa STRATZ, kinuha sa haba ng bawat laro mo. Kasama sa average ng rank ang mga talo nila, kaya ang player na madalas manalo ay mas mataas sa kills at assists.",
    fromImported:
      "Hindi sumasagot ang OpenDota ngayon, kaya ang mga larong na-import na sa Dota Den ang ginamit. Walang last hits ang mga iyon, kaya kills + assists at deaths lang ang pinaghambing.",
    status: {
      unranked:
        "Kailangan ng rank medal mo para makapagkumpara: laruin ang calibration games mo (o ipakita nang public ang rank mo sa Dota), tapos bumalik.",
      unavailable:
        "Hindi available ngayon ang mga average ng rank. Subukan ulit pagkalipas ng ilang minuto.",
      no_games:
        "Hindi ma-load ang mga laro mo: hindi sumasagot ang OpenDota ngayon. Subukan ulit sa ilang minuto.",
      too_few:
        "Maglaro ng hindi bababa sa 5 laro (15 minuto o higit pa) sa isang hero sa huling 60 araw para makumpara ito.",
    },
  },
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
    emptyBody:
      "Lalabas dito ang mga hero na nilalaro mo kapag na-import na ang mga laro mo. Sinisimulan ng overview mo ang import at doon mo makikita kung kumusta na ito.",
    emptyLink: "Pumunta sa overview",
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
  own: {
    metaTitle: "Matchups",
    kicker: "Matchups",
    title: "Sino ang tumatalo sa iyo",
    description:
      "Ang record mo laban at kasama ang bawat hero, binilang mula sa mga lineup ng sarili mong na-import na laro.",
    link: "Sino ang tumatalo sa iyo: matchups mula sa mga laro mo",
    linkHero: "Matchups mula sa mga laro mo gamit si {name}",
    back: "Bumalik sa mga hero mo",
    last90: "Huling 90 araw",
    progressRunning:
      "Binabasa pa ang mga lineup ng mas lumang laro mo: may matchups na para sa {done} sa {total} sa ngayon. Nagpapatuloy ito tuwing nagsi-sync ang mga match mo at sa araw-araw na update.",
    progressMissing: "Walang lineup sa OpenDota ang {games} kaya hindi isinama.",
    sample: "Binilang mula sa {done} sa {games} mo sa view na ito na may parehong lineup.",
    baseline: "Win rate mo sa mga ito: {rate}.",
    noGamesTitle: "Wala pang laro na may lineup dito",
    noGames: "Wala pang lineup ang alinman sa mga laro mo sa view na ito.",
    noGamesFiltered: "Subukan ang mas mahabang panahon o lahat ng laro.",
    opponents: "Mga kalaban mo",
    toughest: "Pinakamahirap na kalaban",
    toughestNote:
      "Mga kalabang hero na tinatalo mo sa wala pang kalahati ng mga laro mo laban sa kanila.",
    easiest: "Pinakamadaling kalaban",
    easiestNote:
      "Mga kalabang hero na tinatalo mo sa kalahati o higit pa ng mga laro mo laban sa kanila.",
    bestAllies: "Mga kakamping panalo ka",
    worstAllies: "Mga kakamping talo ka",
    allies: "Kasama ang mga kakampi mo",
    alliesNote: "Mga hero sa team mo (hindi ang sa iyo) at ang record mo kasama sila.",
    emptyToughest: "Walang kalabang hero na may {min}+ laro kung saan mas madalas kang talo.",
    emptyEasiest:
      "Walang kalabang hero na may {min}+ laro kung saan panalo ka sa kalahati o higit pa.",
    emptyBestAllies:
      "Walang kakamping hero na may {min}+ laro kung saan panalo ka sa kalahati o higit pa.",
    emptyWorstAllies: "Walang kakamping hero na may {min}+ laro kung saan mas madalas kang talo.",
    record: "{wins}–{losses}",
    rowLabel: "{name}: {wins}, {losses} ({rate}) sa {games}",
    playedInto: "Nilaro mo",
    playedIntoItem: "{name} {wins}–{losses}",
    footer:
      "Hindi isinama ang mga hero na nakaharap mo nang wala pang {min} laro ({enemies}, {allies}). Hinahati ang mga listahan sa 50% at inihahanay nang may hila papuntang 50%, kaya hindi mangunguna ang ilang suwerteng laro.",
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
  coaching: {
    kicker: "Coaching",
    worksTitle: "Ano ang gumagana para sa iyo",
    worksDescription:
      "Ang win rate mo sa mga larong binili mo ang bawat item laban sa mga larong hindi, mula sa {games} na may purchase data kay {hero}.",
    worksFooter:
      "Ugnayan ito sa mga laro mo, hindi sanhi: ang item na binibili sa mas mahahabang laro o sa mga larong panalo na ay puwedeng magmukhang mas maganda o mas pangit kaysa sa totoo. Kailangan ng item ng hindi bababa sa {min} larong binili at {min} na hindi.",
    worksNotEnough:
      "Kulang pa ang mga laro: {games} ang may purchase data, at kailangan ng item ng hindi bababa sa {min} larong binili at {min} na hindi para maikumpara.",
    worksListLabel: "Win rate na may at walang bawat item",
    bought: "Binili: {rate} · {games}",
    skipped: "Hindi binili: {rate} · {games}",
    points: "{pts} pts",
    timingsTitle: "Ang timings at lanes mo",
    analysed: "{analysed} sa {parsed} mong may parsed replay kay {hero} ang nasuri na.",
    timingsNotEnough:
      "Lalabas ang item timings at lane results kapag nasuri na ang {min} sa mga parsed na laro mo kay {hero}. Ilan pa ang binabasa bawat araw.",
    timingsFooter:
      "Median na oras ng unang bili (bilang ng laro sa panaklong; — kung kulang sa 3). Kinukumpara ng lane results ang gold ng lane mo sa 10 minuto sa mga kalaban sa lane (10% pataas o pababa). Ugnayan, hindi sanhi.",
    timingsLabel: "Item timings sa panalo at talo",
    item: "Item",
    inWins: "Sa panalo",
    inLosses: "Sa talo",
    lanesLabel: "Lane results ayon sa role",
    laneGames: "{games} · {wins} panalo",
    laneResults: "lane {won} panalo, {even} tabla, {lost} talo",
    efficiency: "lane efficiency {pct}%",
    noLaneRole: "{games} na walang lane role.",
    roles: { safe: "Safe lane", mid: "Mid", off: "Off lane", jungle: "Jungle" },
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
