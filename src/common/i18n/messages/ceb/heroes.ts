import type { MessageTree } from "../../translate";
import type { heroes as en } from "../en/heroes";

export const heroes: MessageTree<typeof en> = {
  compare: {
    metaTitle: "Unsaon ka ikumpara",
    link: "Unsaon ka ikumpara",
    back: "Imong mga hero",
    kicker: "Imong mga hero",
    title: "Unsaon ka ikumpara",
    description:
      "Imong mga duwa sa matag hero batok sa mga player nga parehas nimo og rank sa parehas nga hero, sa parehas nga gitas-on sa duwa: parehas ba kamo og farm, away ug pagpabiling buhi?",
    against: "Ikumpara sa",
    yourRank: "Imong rank",
    rankAbove: "Ang rank nga mas taas",
    summary: "Imong pinakadakong kulang ug imong pinakakusog",
    teaser: {
      kicker: "Batok sa imong rank",
      title: "Asa ka kumpara sa {rank}",
      link: "Tan-awa ang pagtandi sa matag hero",
    },
    workOn: "Pauswagon",
    strength: "Imong labaw",
    gap: {
      lastHits: {
        better: "{hero}: mas daghan og {pct}% ang imong last hits kaysa mga {rank} player",
        worse: "{hero}: mas gamay og {pct}% ang imong last hits kaysa mga {rank} player",
      },
      fights: {
        better: "{hero}: mas daghan og {pct}% ang imong kills + assists kaysa mga {rank} player",
        worse: "{hero}: mas gamay og {pct}% ang imong kills + assists kaysa mga {rank} player",
      },
      deaths: {
        better: "{hero}: mas gamay og {pct}% ang imong deaths kaysa mga {rank} player",
        worse: "{hero}: mas daghan og {pct}% ang imong deaths kaysa mga {rank} player",
      },
    },
    numbers: "Ikaw {yours} · sila {theirs} (matag duwa, parehas nga gitas-on)",
    heroesTitle: "Batok sa mga {rank} player",
    games: { one: "1 ka duwa", other: "{n} ka duwa" },
    stats: { lastHits: "Last hits", fights: "Kills + assists", deaths: "Deaths" },
    brackets: {
      HERALD_GUARDIAN: "Herald–Guardian",
      CRUSADER_ARCHON: "Crusader–Archon",
      LEGEND_ANCIENT: "Legend–Ancient",
      DIVINE_IMMORTAL: "Divine–Immortal",
    },
    locked: {
      one: "Sa Plus, 1 pa ka hero nimo ang ikumpara.",
      other: "Sa Plus, {n} pa ka hero nimo ang ikumpara.",
    },
    seePlus: "Tan-awa ang Plus",
    method:
      "Imong mga public game sa katapusang {days} ka adlaw (15 minutos o labaw; mga hero nga adunay 5+ ka duwa), batok sa average sa katapusang tibuok semana sa mga duwa niadtong rank sa STRATZ, gikuha sa gitas-on sa matag duwa nimo. Apil sa average sa rank ang ilang mga pildi, mao nga ang player nga kanunay modaog mas taas sa kills ug assists.",
    fromImported:
      "Wala motubag ang OpenDota karon, mao nga ang mga dula nga na-import na sa Dota Den ang gigamit. Walay last hits kadto, mao nga kills + assists ug deaths ra ang gitandi.",
    status: {
      unranked:
        "Kinahanglan ang imong rank medal aron makakumpara: duwaa ang imong calibration games (o ipakita sa publiko ang imong rank sa Dota), dayon balik.",
      unavailable:
        "Dili available karon ang mga average sa rank. Sulayi pag-usab human sa pipila ka minuto.",
      no_games:
        "Dili ma-load ang imong mga dula: wala motubag ang OpenDota karon. Sulayi pag-usab sa pipila ka minuto.",
      too_few:
        "Pagdula og labing menos 5 ka duwa (15 minutos o labaw) sa usa ka hero sa katapusang 60 ka adlaw aron ikumpara kini.",
    },
  },
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
    emptyBody:
      "Makita dinhi ang mga hero nga imong gidula kung na-import na ang imong mga duwa. Ang imong overview ang mosugod sa import ug didto nimo makita kung unsa na kini.",
    emptyLink: "Adto sa overview",
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
  own: {
    metaTitle: "Matchups",
    kicker: "Matchups",
    title: "Kinsa ang nakapildi nimo",
    description:
      "Ang imong record batok ug kauban ang matag hero, giihap gikan sa mga lineup sa imong kaugalingong na-import nga mga duwa.",
    link: "Kinsa ang nakapildi nimo: matchups gikan sa imong mga duwa",
    linkHero: "Matchups gikan sa imong mga duwa gamit si {name}",
    back: "Balik sa imong mga hero",
    last90: "Katapusang 90 ka adlaw",
    progressRunning:
      "Gibasa pa ang mga lineup sa imong mas karaang mga duwa: adunay matchups para sa {done} sa {total} sa pagkakaron. Magpadayon kini matag sync sa imong mga match ug sa adlaw-adlaw nga update.",
    progressMissing: "Walay lineup sa OpenDota ang {games} mao nga wala giapil.",
    sample: "Giihap gikan sa {done} sa imong {games} niini nga view nga adunay duha ka lineup.",
    baseline: "Imong win rate niini: {rate}.",
    noGamesTitle: "Wala pay duwa nga adunay lineup dinhi",
    noGames: "Wala pay lineup ang bisan unsa sa imong mga duwa niini nga view.",
    noGamesFiltered: "Sulayi ang mas taas nga panahon o tanang duwa.",
    opponents: "Imong mga kaaway",
    toughest: "Pinakalisod nga kaaway",
    toughestNote:
      "Mga kaaway nga hero nga imong gidaog sa ubos sa katunga sa imong mga duwa batok kanila.",
    easiest: "Pinakasayon nga kaaway",
    easiestNote:
      "Mga kaaway nga hero nga imong gidaog sa katunga o labaw pa sa imong mga duwa batok kanila.",
    bestAllies: "Mga kauban nga modaog ka",
    worstAllies: "Mga kauban nga mapildi ka",
    allies: "Kauban ang imong mga kauban",
    alliesNote: "Mga hero sa imong team (dili imo) ug ang imong record kauban sila.",
    emptyToughest: "Walay kaaway nga hero nga adunay {min}+ ka duwa diin mas kanunay kang mapildi.",
    emptyEasiest:
      "Walay kaaway nga hero nga adunay {min}+ ka duwa diin modaog ka sa katunga o labaw pa.",
    emptyBestAllies:
      "Walay kauban nga hero nga adunay {min}+ ka duwa diin modaog ka sa katunga o labaw pa.",
    emptyWorstAllies:
      "Walay kauban nga hero nga adunay {min}+ ka duwa diin mas kanunay kang mapildi.",
    record: "{wins}–{losses}",
    rowLabel: "{name}: {wins}, {losses} ({rate}) sa {games}",
    playedInto: "Imong gidula",
    playedIntoItem: "{name} {wins}–{losses}",
    footer:
      "Wala giapil ang mga hero nga imong naatubang og kulang sa {min} ka duwa ({enemies}, {allies}). Gibahin ang mga lista sa 50% ug gihan-ay nga adunay bira padulong sa 50%, aron dili manguna ang pipila ka swerte nga duwa.",
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
  coaching: {
    kicker: "Coaching",
    worksTitle: "Unsa ang epektibo para nimo",
    worksDescription:
      "Imong win rate sa mga duwa nga gipalit nimo ang matag item batok sa mga duwa nga wala, gikan sa {games} nga adunay purchase data kang {hero}.",
    worksFooter:
      "Kalambigitan kini sa imong mga duwa, dili hinungdan: ang item nga gipalit sa mas taas nga duwa o sa mga duwa nga nagdaog na mahimong morag mas maayo o mas daotan kaysa sa tinuod. Ang item nanginahanglan og labing menos {min} ka duwa nga gipalit ug {min} nga wala.",
    worksNotEnough:
      "Kulang pa ang mga duwa: {games} ang adunay purchase data, ug ang item nanginahanglan og labing menos {min} ka duwa nga gipalit ug {min} nga wala aron maikumpara.",
    worksListLabel: "Win rate nga adunay ug walay matag item",
    bought: "Gipalit: {rate} · {games}",
    skipped: "Wala gipalit: {rate} · {games}",
    points: "{pts} pts",
    timingsTitle: "Imong timings ug lanes",
    analysed: "{analysed} sa imong {parsed} nga adunay parsed replay kang {hero} ang nasusi na.",
    timingsNotEnough:
      "Makita ang item timings ug lane results kung nasusi na ang {min} sa imong parsed nga duwa kang {hero}. Pipila pa ang basahon matag adlaw.",
    timingsFooter:
      "Median nga oras sa unang palit (ihap sa duwa sa parentesis; — kung ubos sa 3). Ang lane results nagkumpara sa gold sa imong lane sa 10 minutos sa mga kaatbang sa lane (10% pataas o paubos). Kalambigitan, dili hinungdan.",
    timingsLabel: "Item timings sa daog ug pildi",
    item: "Item",
    inWins: "Sa daog",
    inLosses: "Sa pildi",
    lanesLabel: "Lane results sumala sa role",
    laneGames: "{games} · {wins} daog",
    laneResults: "lane {won} daog, {even} patas, {lost} pildi",
    efficiency: "lane efficiency {pct}%",
    noLaneRole: "{games} nga walay lane role.",
    roles: { safe: "Safe lane", mid: "Mid", off: "Off lane", jungle: "Jungle" },
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
