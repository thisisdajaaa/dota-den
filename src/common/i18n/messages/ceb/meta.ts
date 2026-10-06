import type { MessageTree } from "../../translate";
import type { meta as en } from "../en/meta";

export const meta: MessageTree<typeof en> = {
  title: "Meta",
  counts: {
    games: { one: "1 ka duwa", other: "{n} ka duwa" },
    otherGames: {
      one: "1 pa ka duwa ang walay lane data ug wala giihap.",
      other: "{n} pa ka duwa ang walay lane data ug wala giihap.",
    },
    proDrafts: { one: "1 ka pro draft", other: "{n} ka pro draft" },
    picks: { one: "1 ka pick", other: "{n} ka pick" },
    bans: { one: "1 ka ban", other: "{n} ka ban" },
  },
  unavailable: {
    heroStats: {
      busy: "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang hero stats. Sulayi pag-usab human sa usa ka minuto.",
      down: "Dili available ang hero stats karon. Sulayi pag-usab unya.",
    },
    proLaneData: {
      busy: "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang pro lane data. Sulayi pag-usab human sa usa ka minuto.",
      down: "Dili available ang pro lane data karon. Sulayi pag-usab unya.",
    },
  },
  page: {
    kicker: "Meta",
    title: "Unsa ang kusog karon",
    description:
      "Ang mga hero ug lane partner nga labing maayo sa matag role sa bag-ong high-rank nga mga duwa ug tournament, uban ang mga kausaban niining patch.",
    guides: "Mga hero guide",
    pickRole: "Unsa nga role imong gidula?",
    loading: "Gi-load ang meta",
    loadingTopHeroes: "Gi-load ang mga top hero",
    loadingTips: "Gi-load ang patch tips",
    loadingDuos: "Gi-load ang lane duos",
  },
  patchLine: {
    none: "Wala pay na-import nga patch notes.",
    unavailable: "Dili available ang impormasyon sa patch karon.",
    latest: "Pinakabag-ong patch:",
    released:
      ", gi-release niadtong {date}. Ang public stats naglangkob sa bag-ong mga duwa ug mahimong naay pipila gikan sa wala pa kini.",
  },
  yourRole: {
    title: "Imong role",
    unavailable:
      "Dili available ang imong bag-ong mga lane karon, mao nga dili namo masulti ang imong role. Pagpili og usa sa ubos.",
    tooFewOne:
      "Dili pa namo masulti ang imong role: {games} gikan sa milabay nga {days} ka adlaw ang adunay lane data, ug kinahanglan namo og labing menos {min}. Ang lane data anaa ra sa mga duwa nga na-parse sa OpenDota. Pagpili og role sa ubos.",
    tooFewOther:
      "Dili pa namo masulti ang imong role: {games} gikan sa milabay nga {days} ka adlaw ang adunay lane data, ug kinahanglan namo og labing menos {min}. Ang lane data anaa ra sa mga duwa nga na-parse sa OpenDota. Pagpili og role sa ubos.",
    basedOn: "Base sa imong katapusang {games} nga adunay lane data (milabay nga {days} ka adlaw).",
    byPosition: "Mga duwa sumala sa position",
    positionGames: "{pos}: {games}",
  },
  roles: {
    tabsLabel: "Position",
    you: "(ikaw)",
    chooseRole: "Pilia ang imong role",
    core: "Core",
    support: "Support",
  },
  topHeroes: {
    kicker: "Karon",
    title: "Mga top hero: {name}",
    titleShort: "Mga top hero",
    description:
      "Gihan-ay sumala sa win rate gikan Ancient hangtod Immortal ug niining lane, nga ang gagmay nga sample gibira paingon sa 50%, ug gamay nga dugang para sa mga hero nga gi-agawan sa tournaments.",
    publicSource: "High-rank ug lane stats: public nga duwa sa OpenDota, na-update {ago}.",
    proOk: "Tournaments: {drafts} sa milabay nga {days} ka adlaw, na-update {ago}.",
    proTooFew: "Tournaments: {drafts} ra sa milabay nga {days} ka adlaw, kulang aron gamiton.",
    proUnavailable: "Dili available ang tournament data karon.",
    laneUnavailable:
      "Dili available ang lane data karon, mao nga dili masusi niining lista kung asang lane gidula ang matag hero. Gamiton na lang niini ang naandan nga role sa hero.",
    notEnough:
      "Kulang ang data aron ihan-ay ang mga hero niining role karon. Sulayi pag-usab unya.",
    highRank: "win rate sa taas nga rank · {games}",
    laneRate: "win rate · {games} ({share} sa iyang mga duwa anaa niining lane)",
    laneNoData: "{lane}: dili available ang lane data",
    tournaments: "Tournaments: {picks} · {bans} sa {drafts} ({contest} gi-agawan)",
    trendTitle:
      "Kausaban sa bahin sa public picks, katapusang 3 ka adlaw batok sa sayo pa karong semanaha",
    rising: "Misaka",
    falling: "Mius-os",
  },
  tips: {
    kicker: "Patch {version}",
    kickerShort: "Patch",
    title: "Patch tips",
    description: "Unsa ang nausab ug unsa ang naglihok para sa top {n} ka hero niining role.",
    footerUnavailable:
      "Dili available ang patch notes karon, mao nga wala giapil ang mga kausaban sa patch.",
    footerNone:
      "Wala pay na-import nga patch notes, mao nga wala giapil ang mga kausaban sa patch.",
    footerOk:
      "Orihinal nga pulong sa Valve ang mga kausaban sa patch; ablihi ang patch page para sa tibuok notes.",
    empty:
      "Walay kausaban sa patch, dakong pick trend o talagsaong numero para niining mga hero karon.",
    seeAll: "Tan-awa ang tanang {n} ka kausaban",
    seeNotes: "Tan-awa ang patch notes",
    needStats:
      "Kinahanglan sa patch tips ang hero stats, nga dili available karon. Mahimo ka gihapong",
    readNotes: "mobasa sa patch notes",
    changed: "Giusab sa {version}: {line}",
    rising:
      "Misaka: {pct} nga mas kanunay i-pick sa public nga duwa sa katapusang 3 ka adlaw kaysa sayo pa karong semanaha",
    falling:
      "Mius-os: {pct} nga mas talagsa i-pick sa public nga duwa sa katapusang 3 ka adlaw kaysa sayo pa karong semanaha",
    contested:
      "Gi-agawan sa tournaments: na-pick o na-ban sa {pct} sa {drafts} ka pro draft sa milabay nga {days} ka adlaw",
    lane: "Modaog sa {pct} sa {games} ka public nga duwa sa {lane}",
  },
  duos: {
    kicker: "Lane partners",
    title: "Pinakakusog nga lane duos",
    soloLane: "Solo lane ang mid, mao nga walay lane duos nga ikapakita.",
    description:
      "Duha ka hero gikan sa samang team nga managsama sa {lane}, sa mga pro match sa milabay nga {days} ka adlaw. Wala giapil ang mga pares nga kulang sa 8 ka duwa.",
    source: "Source: pro match database sa OpenDota, na-update {ago}.",
    empty: "Wala pay pares sa {lane} nga adunay igong pro games.",
    rate: "{rate} win rate · {games}",
  },
};
