import type { MessageTree } from "../../translate";
import type { together as en } from "../en/together";

export const together: MessageTree<typeof en> = {
  and: "at",
  units: {
    game: { one: "1 laro", other: "{n} laro" },
    otherGame: { one: "1 pang laro", other: "{n} pang laro" },
    partyGame: { one: "1 party game", other: "{n} party game" },
    confirmedPartyGame: { one: "1 kumpirmadong party game", other: "{n} kumpirmadong party game" },
    win: { one: "1 panalo", other: "{n} panalo" },
    loss: { one: "1 talo", other: "{n} talo" },
    time: { one: "1 beses", other: "{n} beses" },
    sharedMatch: { one: "1 larong magkasama kayo", other: "{n} larong magkasama kayo" },
  },
  comparison: {
    vsUsual: "{delta} kumpara sa karaniwan mo",
    usualDetail: "Karaniwan mo: {rate} sa {games} sa parehong panahon.",
    tooFewValue: "Kulang pa ang larong magkasama para husgahan",
    tooFewDetail:
      "Kailangan ng hindi bababa sa {needed} kumpirmadong party game para maikumpara; {games} pa lang ang sa iyo.",
    noBaselineValue: "Wala pang batayan",
    noBaselineSync: "I-sync ang mga laro mo sa Buod para maikumpara sa karaniwan mong win rate.",
    noBaselineFew:
      "{games} lang ang sa iyo sa parehong panahon; kailangan ng {needed} para sa batayan.",
    caveat:
      "Marami pang ibang nagbabago: role, hero, kalaban. Pahiwatig lang ang agwat dito, hindi patunay na ang paglalaro nang magkasama ang dahilan.",
  },
  page: {
    title: "Maglaro nang magkasama",
    kicker: "Group play",
    description:
      "Kung paano ka maglaro kasama ang mga kaibigang ka-queue mo. Ang mga laro lang kung saan nasa iisang party kayo ang binibilang na magkasama; hindi kasama ang pagkakataong napunta kayo sa iisang team.",
    peersBusy:
      "Busy ang OpenDota ngayon, kaya hindi namin na-load ang mga kakampi mo. Subukan ulit pagkalipas ng isang minuto.",
    peersError: "Hindi ma-load ang mga kakampi mo mula sa OpenDota ngayon. Subukan ulit maya-maya.",
    howTitle: "Paano natutukoy ang “magkasama”",
    howBody:
      "Tinitingnan namin sa bawat larong magkasama kayo ang party na kinabibilangan ninyong dalawa. Ang mga laro sa iisang team na walang party data, at ang mga larong magkalaban kayo, ay hiwalay na nakalista at hindi kailanman binibilang. May kulang ba?",
    howLink: "I-track sila",
    howAfter: "at lalabas sila rito.",
    loading: "Nilo-load ang mga kaibigan mo",
    error: "May nagkamali sa pag-load ng mga larong magkasama kayo",
  },
  friends: {
    kicker: "Mga kaibigan",
    title: "Mga kalaro mo",
    description:
      "Ang mga pinakamadalas mong kakampi sa OpenDota, pati ang mga player na tina-track mo.",
    emptyBefore:
      "Wala pang kakampi. Lalabas sila rito pagkatapos ng ilang public na larong magkasama kayo. Puwede ka ring",
    emptyLink: "mag-track ng kaibigan",
    emptyAfter: "para idagdag sila.",
    onYourTeam: "{games} sa team mo",
    tracked: "Tina-track na player",
    noParties: "wala pang kumpirmadong party",
    lastPlayedTitle: "Huling naglaro nang magkasama o magkalaban",
  },
  pair: {
    label: "Pares",
    kicker: "Naglalaro nang magkasama",
    you: "Ikaw",
    viewProfile: "Tingnan ang profile ni {name}",
    statsLabel: "Stats nang magkasama",
    gamesTogether: "Mga larong magkasama",
    confirmedLast: "Kumpirmadong party · huli {ago}",
    confirmedOnly: "Kumpirmadong party lang",
    winRateTogether: "Win rate nang magkasama",
    comparedKicker: "Kumpara sa karaniwan mo",
    partyNote:
      "Ang mga laro lang kung saan sinasabi ng OpenDota na nasa iisang party kayo ang binibilang na “magkasama”.",
    pending:
      "Sinusuri pa ang mas maraming laro… {count} pa ang titingnan{paused}. Ang stats sa ibaba ay para sa mga natingnan na.",
    paused: " (busy ang OpenDota, kaya huminto muna kami)",
    checkMore: "Tingnan pa ngayon",
  },
  form: {
    kicker: "Kamakailang porma nang magkasama",
    title: "Huling {games}",
    win: "Panalo",
    loss: "Talo",
    winAs: "Panalo gamit si {hero}",
    lossAs: "Talo gamit si {hero}",
  },
  heroPairs: {
    kicker: "Hero chemistry",
    title: "Pinakamagandang pares ng hero",
    description:
      "Mga kombinasyong nilaro ninyo nang hindi bababa sa {min} beses bilang party, pinakamadalas muna.",
    empty: "Wala pang pares ng hero na nilaro nang {min}+ beses nang magkasama.",
    you: "Ikaw",
    games: "Laro",
    record: "Record",
  },
  partyMatches: {
    kicker: "Kasaysayan ng laro",
    title: "Mga huling larong magkasama",
    empty: "Walang kumpirmadong party game sa mga larong natingnan na.",
  },
  other: {
    label: "Iba pang larong magkasama kayo",
    sameTeamTitle: "Iisang team pero hindi alam ang party",
    sameTeamSummary: "{games} sa iisang team na hindi binibilang na magkasama",
    noPartyData:
      "Walang party data ang {games}, kaya hindi namin masabi kung magkasama kayong nag-queue.",
    separately: "Sa {games}, magkahiwalay kayong nag-queue at napunta lang sa iisang team.",
    never: "Hindi namin kailanman binibilang ang mga ito bilang larong magkasama.",
    againstTitle: "Naglaban kayo",
    againstSummary: "{games} na nasa kabilang team si {name}",
    noneAgainst: "Wala sa mga larong natingnan na.",
    unchecked: {
      one: "Hindi natingnan ang 1 larong magkasama kayo (walang match details o anonymous ang isang player), kaya hindi ito binilang kahit saan.",
      other:
        "Hindi natingnan ang {n} larong magkasama kayo (walang match details o anonymous ang isang player), kaya hindi ito binilang kahit saan.",
    },
  },
  skeleton: {
    label: "Sinusuri ang mga larong magkasama kayo",
    status: "Hinahanap ang party data sa mga larong magkasama kayo…",
  },
  stacks: {
    duo: "Duo",
    trio: "Trio",
    fourStack: "Four-stack",
    fiveStack: "Five-stack",
    party: "Party",
    kicker: "Mga party",
    title: "Pinakamagandang stack",
    description:
      "Sino ang dapat mong ka-queue: mga kumpirmadong party na niraranggo ayon sa win rate, hinihila papuntang 50% hangga't kulang pa ang laro. Kailangan ng {min} larong magkasama.",
    empty:
      "Wala pang party na may {min}+ laro. Buksan ang page ng isang kaibigan para masuri ang mga larong magkasama kayo.",
    you: "Ikaw,",
    unknownParty: {
      one: "Walang party data ang 1 laro na may kaibigan sa team mo, kaya hindi ito binilang.",
      other: "Walang party data ang {n} laro na may kaibigan sa team mo, kaya hindi ito binilang.",
    },
  },
  trios: {
    kicker: "Mga trio",
    title: "Mga karaniwan mong trio",
    description:
      "Mga laro kung saan ikaw at ang dalawang kaibigan ay nasa iisang party. Dumarami ang bilang habang binubuksan mo ang page ng bawat kaibigan at mas maraming laro ang nasusuri.",
    empty:
      "Wala pang nahanap na trio. Buksan ang page ng isang kaibigan para masuri ang mga larong magkasama kayo.",
    you: "Ikaw,",
    asParty: "{games} bilang party",
    winRate: "{rate} win rate",
  },
  teammates: {
    kicker: "Mga kakampi",
    title: "Mga kalaro mo",
    description:
      "Mga laro sa iisang team sa mga public match mo, magkasama man kayong nag-queue o hindi.",
    playTogether: "Maglaro nang magkasama",
    sortLabel: "Ayusin ang mga kakampi ayon sa",
    sortGames: "Pinakamaraming laro",
    sortWinRate: "Win rate",
    sortRecent: "Pinakabago",
    hiddenNote:
      "Ipinapakita ang mga kakampi na may {min}+ laro; {hidden} na mas kaunti ang hindi isinama para hindi manguna ang isa o dalawang suwerteng laro.",
    empty: "Wala pang kakampi na may {min}+ laro kasama ka.",
    against: "Kalaban: {games} · {wins}",
    neverAgainst: "Hindi kailanman nasa kabilang team",
    lastPlayed: "huling naglaro {ago}",
    profile: "Profile",
    tooFew: "Kulang pa ang laro para ikumpara",
    noUsual: "Walang karaniwang maikukumpara",
    usual: "Karaniwan {rate}",
    showFewer: "Ipakita nang mas kaunti",
    showAll: "Ipakita lahat ng {n} kakampi",
  },
  summary: {
    label: "Mga highlight ng kakampi",
    best: "Pinakamagaling na kakampi",
    bestDetail:
      "{rate} sa {games} sa team mo. Niranggo matapos hilahin ang bawat rate papunta sa karaniwan mong {usual} (na parang may {shrink} dagdag na karaniwang laro), para hindi manalo ang maiikling suwerteng takbo.",
    bestNeeds: "Kailangan ng kakampi na may {min}+ laro sa team mo at ng kabuuang record mo.",
    notEnough: "Kulang pa ang laro",
    mostPlayed: "Pinakamadalas kasama",
    mostPlayedDetail: "{games} sa team mo · {rate} win rate",
    nobody: "Wala pa",
    lastGames: "Huling {games} mo",
    queueDetail:
      "{solo} solo · {unknown} hindi alam (walang party data, hindi kailanman ipinapalagay na solo)",
    importHint:
      "I-import ang mga laro mo para makita kung gaano ka kadalas mag-queue kasama ang iba.",
    inParty: "{n} sa party",
    noGames: "Walang na-import na laro",
    rival: "Karibal",
    rivalFaced: "Nakaharap {times} · nanalo ka {wins}",
    rivalTeammates: "{games} bilang magkakampi",
    rivalNever: "hindi kailanman naging kakampi",
    rivalNone:
      "Walang nakaharap mo nang {min}+ beses at mas madalas kaysa sa pagiging magkakampi ninyo.",
    noRivals: "Wala pang karibal",
    loading: "Nilo-load ang mga kakampi",
  },
  pairPage: {
    titleWith: "Kasama si {name}",
    notFound: "Hindi nahanap ang player",
    back: "Lahat ng kaibigan",
    sharedBusy:
      "Busy ang OpenDota ngayon, kaya hindi namin na-load ang mga larong magkasama kayo. Subukan ulit pagkalipas ng isang minuto.",
    sharedError:
      "Hindi ma-load ang mga larong magkasama kayo mula sa OpenDota ngayon. Subukan ulit maya-maya.",
    noSharedTitle: "Wala pang larong magkasama kayo",
    noSharedBody:
      "Walang public na laro sa OpenDota na kasama kayo ni {name}. Lalabas ang mga laro kapag pareho na ninyong naka-on ang “Expose Public Match Data” sa Dota 2.",
    basedOn: {
      one: "Batay sa pinakabago mong public na laro kasama si {name} sa OpenDota.",
      other: "Batay sa {n} pinakabago mong public na laro kasama si {name} sa OpenDota.",
    },
  },
  notFound: {
    title: "Hindi nahanap ang player",
    body: "Hindi ito valid na Dota account ID. Pumili na lang ng kaibigan mula sa listahan mo.",
    back: "Bumalik sa mga kaibigan mo",
  },
};
