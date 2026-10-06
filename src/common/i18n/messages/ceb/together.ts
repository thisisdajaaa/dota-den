import type { MessageTree } from "../../translate";
import type { together as en } from "../en/together";

export const together: MessageTree<typeof en> = {
  and: "ug",
  units: {
    game: { one: "1 ka duwa", other: "{n} ka duwa" },
    otherGame: { one: "1 pa ka duwa", other: "{n} pa ka duwa" },
    partyGame: { one: "1 ka party game", other: "{n} ka party game" },
    confirmedPartyGame: {
      one: "1 ka kumpirmadong party game",
      other: "{n} ka kumpirmadong party game",
    },
    win: { one: "1 ka daog", other: "{n} ka daog" },
    loss: { one: "1 ka pildi", other: "{n} ka pildi" },
    time: { one: "1 ka higayon", other: "{n} ka higayon" },
    sharedMatch: { one: "1 ka duwa nga magkauban mo", other: "{n} ka duwa nga magkauban mo" },
  },
  comparison: {
    vsUsual: "{delta} itandi sa imong naandan",
    usualDetail: "Imong naandan: {rate} sa {games} sa samang panahon.",
    tooFewValue: "Kulang pa ang duwa nga magkauban aron mahukman",
    tooFewDetail:
      "Ang pagtandi nanginahanglan og labing menos {needed} ka kumpirmadong party game; {games} pa lang ang imo.",
    noBaselineValue: "Wala pay basehan",
    noBaselineSync:
      "I-sync ang imong mga duwa sa Kinatibuk-an aron matandi sa imong naandang win rate.",
    noBaselineFew: "{games} ra ang imo sa samang panahon; ang basehan nanginahanglan og {needed}.",
    caveat:
      "Daghan pang lahi: role, hero, kaatbang. Timaan ra ang kalainan dinhi, dili pamatuod nga ang pagduwa nga magkauban ang hinungdan.",
  },
  page: {
    title: "Pagduwa nga magkauban",
    kicker: "Group play",
    description:
      "Unsaon nimo pagduwa uban sa mga higala nga imong ka-queue. Ang mga duwa ra diin naa mo sa samang party ang giihap nga magkauban; dili maapil ang pagkasama sa team tungod sa tsamba.",
    peersBusy:
      "Busy ang OpenDota karon, mao nga wala namo ma-load ang imong mga kauban. Sulayi pag-usab human sa usa ka minuto.",
    peersError: "Dili ma-load ang imong mga kauban gikan sa OpenDota karon. Sulayi pag-usab unya.",
    howTitle: "Giunsa pagtino ang “magkauban”",
    howBody:
      "Among susihon sa matag duwa nga magkauban mo ang party nga inyong gisudlan. Ang mga duwa sa samang team nga walay party data, ug ang mga duwa nga magkaatbang mo, gilista nga lahi ug dili gyud giihap. Naay kulang?",
    howLink: "I-track sila",
    howAfter: "ug mogawas sila dinhi.",
    loading: "Gi-load ang imong mga higala",
    error: "Adunay sayop sa pag-load sa inyong mga duwa nga magkauban",
  },
  friends: {
    kicker: "Mga higala",
    title: "Mga tawo nga imong kaduwa",
    description:
      "Ang imong kanunay nga mga kauban sa OpenDota, ug ang mga player nga imong gi-track.",
    emptyBefore:
      "Wala pay kauban. Mogawas sila dinhi human sa pipila ka public nga duwa nga magkauban mo. Mahimo ka usab",
    emptyLink: "mag-track og higala",
    emptyAfter: "aron idugang sila.",
    onYourTeam: "{games} sa imong team",
    tracked: "Gi-track nga player",
    noParties: "wala pay kumpirmadong party",
    lastPlayedTitle: "Katapusang nagduwa nga magkauban o magkaatbang",
  },
  pair: {
    label: "Pares",
    kicker: "Nagduwa nga magkauban",
    you: "Ikaw",
    viewProfile: "Tan-awa ang profile ni {name}",
    statsLabel: "Stats nga magkauban",
    gamesTogether: "Mga duwa nga magkauban",
    confirmedLast: "Kumpirmadong party · katapusan {ago}",
    confirmedOnly: "Kumpirmadong party ra",
    winRateTogether: "Win rate nga magkauban",
    comparedKicker: "Itandi sa imong naandan",
    partyNote:
      "Ang mga duwa ra diin giingon sa OpenDota nga naa mo sa samang party ang giihap nga “magkauban”.",
    pending:
      "Gisusi pa ang dugang nga mga duwa… {count} pa ang susihon{paused}. Ang stats sa ubos para sa mga nasusi na.",
    paused: " (busy ang OpenDota, mao nga mihunong sa makadiyot)",
    checkMore: "Susiha pa karon",
  },
  form: {
    kicker: "Bag-ong porma nga magkauban",
    title: "Katapusang {games}",
    win: "Daog",
    loss: "Pildi",
    winAs: "Daog gamit si {hero}",
    lossAs: "Pildi gamit si {hero}",
  },
  heroPairs: {
    kicker: "Hero chemistry",
    title: "Labing maayong pares sa hero",
    description:
      "Mga kombinasyon nga inyong gidula labing menos {min} ka higayon isip party, ang kanunay gidula una.",
    empty: "Wala pay pares sa hero nga gidula {min}+ ka higayon nga magkauban.",
    you: "Ikaw",
    games: "Duwa",
    record: "Record",
  },
  partyMatches: {
    kicker: "Kasaysayan sa duwa",
    title: "Bag-ong mga duwa nga magkauban",
    empty: "Walay kumpirmadong party game sa mga duwa nga nasusi na.",
  },
  other: {
    label: "Ubang mga duwa nga magkauban mo",
    sameTeamTitle: "Samang team pero wala mahibal-i ang party",
    sameTeamSummary: "{games} sa samang team nga dili giihap nga magkauban",
    noPartyData:
      "Walay party data ang {games}, mao nga dili namo masulti kung nag-queue mo nga magkauban.",
    separately: "Sa {games}, nag-queue mo nga bulag ug na-match ra sa samang team.",
    never: "Dili gyud namo ihapon kini nga mga duwa nga magkauban.",
    againstTitle: "Nagkaatbang mo",
    againstSummary: "{games} nga naa si {name} sa pikas team",
    noneAgainst: "Wala sa mga duwa nga nasusi na.",
    unchecked: {
      one: "Dili masusi ang 1 ka duwa nga magkauban mo (walay match details o anonymous ang usa ka player), mao nga wala kini giihap bisan asa.",
      other:
        "Dili masusi ang {n} ka duwa nga magkauban mo (walay match details o anonymous ang usa ka player), mao nga wala kini giihap bisan asa.",
    },
  },
  skeleton: {
    label: "Gisusi ang inyong mga duwa nga magkauban",
    status: "Gipangita ang party data sa inyong mga duwa nga magkauban…",
  },
  stacks: {
    duo: "Duo",
    trio: "Trio",
    fourStack: "Four-stack",
    fiveStack: "Five-stack",
    party: "Party",
    kicker: "Mga party",
    title: "Labing maayong stack",
    description:
      "Kinsa ang angay nimong ka-queue: mga kumpirmadong party nga gi-ranggo sumala sa win rate, giduol sa 50% hangtod igo na ang duwa. Nanginahanglan og {min} ka duwa nga magkauban.",
    empty:
      "Wala pay party nga adunay {min}+ ka duwa. Ablihi ang page sa usa ka higala aron masusi ang inyong mga duwa nga magkauban.",
    you: "Ikaw,",
    unknownParty: {
      one: "Walay party data ang 1 ka duwa nga adunay higala sa imong team, mao nga wala kini giihap.",
      other:
        "Walay party data ang {n} ka duwa nga adunay higala sa imong team, mao nga wala kini giihap.",
    },
  },
  trios: {
    kicker: "Mga trio",
    title: "Imong naandang mga trio",
    description:
      "Mga duwa diin ikaw ug duha ka higala naa sa samang party. Modaghan ang ihap samtang imong ablihan ang page sa matag higala ug daghan pang duwa ang masusi.",
    empty:
      "Wala pay trio nga nakit-an. Ablihi ang page sa usa ka higala aron masusi ang inyong mga duwa nga magkauban.",
    you: "Ikaw,",
    asParty: "{games} isip party",
    winRate: "{rate} win rate",
  },
  teammates: {
    kicker: "Mga kauban",
    title: "Kinsa imong kaduwa",
    description:
      "Mga duwa sa samang team sa imong mga public match, nag-queue man mo nga magkauban o wala.",
    playTogether: "Pagduwa nga magkauban",
    sortLabel: "Han-aya ang mga kauban sumala sa",
    sortGames: "Pinakadaghang duwa",
    sortWinRate: "Win rate",
    sortRecent: "Bag-o",
    hiddenNote:
      "Gipakita ang mga kauban nga adunay {min}+ ka duwa; {hidden} nga mas gamay ang wala giapil aron dili manguna ang usa o duha ka swerte nga duwa.",
    empty: "Wala pay kauban nga adunay {min}+ ka duwa uban nimo.",
    against: "Kaatbang: {games} · {wins}",
    neverAgainst: "Wala gyud sa pikas team",
    lastPlayed: "katapusang nagduwa {ago}",
    profile: "Profile",
    tooFew: "Kulang pa ang duwa aron itandi",
    noUsual: "Walay naandan nga itandi",
    usual: "Naandan {rate}",
    showFewer: "Ipakita ang mas gamay",
    showAll: "Ipakita tanang {n} ka kauban",
  },
  summary: {
    label: "Mga highlight sa kauban",
    best: "Labing maayong kauban",
    bestDetail:
      "{rate} sa {games} sa imong team. Gi-ranggo human giduol ang matag rate sa imong naandang {usual} (ingon og adunay {shrink} dugang nga kasagarang duwa), aron dili modaog ang mubong swerte nga sunod-sunod.",
    bestNeeds:
      "Nanginahanglan og kauban nga adunay {min}+ ka duwa sa imong team ug sa imong kinatibuk-ang record.",
    notEnough: "Kulang pa ang duwa",
    mostPlayed: "Kanunay nga kauban",
    mostPlayedDetail: "{games} sa imong team · {rate} win rate",
    nobody: "Wala pa",
    lastGames: "Imong katapusang {games}",
    queueDetail:
      "{solo} solo · {unknown} wala mahibal-i (walay party data, dili gyud isipon nga solo)",
    importHint:
      "I-import ang imong mga duwa aron makita kung unsa ka kanunay mag-queue uban sa uban.",
    inParty: "{n} sa party",
    noGames: "Walay na-import nga duwa",
    rival: "Karibal",
    rivalFaced: "Naatubang {times} · nidaog ka {wins}",
    rivalTeammates: "{games} isip magkauban",
    rivalNever: "wala gyud nahimong kauban",
    rivalNone:
      "Walay imong naatubang {min}+ ka higayon ug mas kanunay pa kaysa inyong pagkauban sa team.",
    noRivals: "Wala pay karibal",
    loading: "Gi-load ang mga kauban",
  },
  pairPage: {
    titleWith: "Uban si {name}",
    notFound: "Wala makit-i ang player",
    back: "Tanang higala",
    sharedBusy:
      "Busy ang OpenDota karon, mao nga wala namo ma-load ang inyong mga duwa nga magkauban. Sulayi pag-usab human sa usa ka minuto.",
    sharedError:
      "Dili ma-load ang inyong mga duwa nga magkauban gikan sa OpenDota karon. Sulayi pag-usab unya.",
    noSharedTitle: "Wala pay duwa nga magkauban mo",
    noSharedBody:
      "Walay public nga duwa sa OpenDota nga naa ka ug si {name}. Mogawas ang mga duwa kung pareho na mo nga naka-on ang “Expose Public Match Data” sa Dota 2.",
    basedOn: {
      one: "Base sa imong pinakabag-ong public nga duwa uban si {name} sa OpenDota.",
      other: "Base sa imong {n} ka pinakabag-ong public nga duwa uban si {name} sa OpenDota.",
    },
  },
  notFound: {
    title: "Wala makit-i ang player",
    body: "Dili kini valid nga Dota account ID. Pagpili na lang og higala gikan sa imong lista.",
    back: "Balik sa imong mga higala",
  },
};
