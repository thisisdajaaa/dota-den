import type { MessageTree } from "../../translate";
import type { dashboard as en } from "../en/dashboard";

export const dashboard: MessageTree<typeof en> = {
  title: "Dashboard",
  loading: "Gi-load ang dashboard",
  showing: {
    one: "Gipakita ang {shown} sa imong 1 ka duwa",
    other: "Gipakita ang {shown} sa imong {n} ka duwa",
  },
  noneInView: "Walay duwa niini nga view. Sulayi ang mas lapad nga panahon.",
  keyStats: "Importanteng stats",
  winRate: "Win rate",
  soloWinRate: "Solo win rate",
  partyWinRate: "Party win rate",
  kdaRatio: "KDA ratio",
  wins: { one: "1 ka daog", other: "{n} ka daog" },
  losses: { one: "1 ka pildi", other: "{n} ka pildi" },
  soloGames: { one: "1 ka solo nga duwa", other: "{n} ka solo nga duwa" },
  partyGames: { one: "1 ka party nga duwa", other: "{n} ka party nga duwa" },
  tooFew: " · kulang pa aron mahukman",
  averages: "Avg {kills} kills · {deaths} deaths · {assists} assists",
  empty: {
    first_sync: {
      title: "Gitawag ang imong kasaysayan sa duwa…",
      body: "Gi-import namo ang imong mga duwa gikan sa OpenDota. Kusog ra mo-update kini nga page.",
    },
    fetching: {
      title: "Gikuha sa OpenDota ang imong kasaysayan sa duwa",
      body: "Gihangyo namo ang OpenDota nga kuhaon ang imong mga duwa gikan sa Steam. Kasagaran pipila ka minuto ra, usahay mas dugay kung daghan kag duwa. Pwede nimo biyaan nga abri kini nga page: kusog ra kini mosusi pag-usab.",
    },
    private: {
      title: "Morag private ang imong match data",
      body: "Dili mabasa sa OpenDota ang imong match history gikan sa Steam. Kasagaran pasabot kini nga naka-off ang “Expose Public Match Data” sa Dota 2. I-on kini ug kusog ra mogawas dinhi ang imong mga duwa.",
    },
    no_public_data: {
      title: "Wala pay nakit-ang public nga duwa",
      body: "Wala pa gihapoy duwa ang OpenDota para niini nga account. Siguroha nga public ang imong match data (mga lakang sa ubos). Samtang wala pa, gihangyo namo ang OpenDota nga kuhaon pag-usab ang imong kasaysayan matag 15 ka minuto, ug mogawas ang bag-ong mga duwa pipila ka minuto human kini mahuman.",
    },
  },
  firstRun: {
    fix: {
      title: "Unsaon pag-ayo",
      expose:
        "Sa Dota 2, ablihi ang Settings → Options → Social ug i-tick ang “Expose Public Match Data”.",
      restart: "I-restart ang Dota 2 aron ma-save ang setting.",
      play: "Pagdula og usa ka match, bisan unsang mode. Mogawas kini dinhi pipila ka minuto human kini mahuman, ug mosunod ang mga daan nga duwa.",
      auto: "Biyai nga abri kini nga page: mosusi kini pag-usab matag 30 segundos. Dili kinahanglan i-refresh.",
    },
    status: {
      kicker: "Gikuha ang imong mga duwa",
      stepsLabel: "Dagan sa import",
      done: "Nahuman na:",
      current: "Gihimo pa:",
      todo: "Sunod:",
      signedIn: "Naka-sign in pinaagi sa Steam",
      requested: "Gihangyo sa OpenDota ang imong match history",
      requestedAgo: "Gihangyo {ago}",
      requestPending: "Mahitabo sa unang sync",
      arrive: "Diri mogawas ang imong mga duwa",
      arriveWaiting: "Gihulat pa nga mahuman ang OpenDota",
      arriveNone: "Wala pay nakit-an. Public ba ang imong match history?",
      lastChecked: "Katapusang gitan-aw {ago}",
    },
    wait: {
      kicker: "Samtang naghulat",
      title: "Mga mahimo nimong sulayan karon",
      draft: {
        title: "Sulayi ang draft",
        body: "Pag-draft batok sa AI nga captain gamit ang tinuod nga rules sa Captain's Mode.",
      },
      meta: {
        title: "Tan-awa ang meta",
        body: "Ang mga hero nga labing maayo sa matag role sa bag-ong high-rank nga mga duwa.",
      },
      mmr: {
        title: "I-log ang imong MMR",
        body: "Isulat ang MMR nga makita nimo karon sa client, aron adunay sinugdanan ang imong pagsaka.",
      },
    },
  },
  plan: {
    title: "Mga goal ug practice",
  },
  lanes: {
    loading: "Gi-load kung asa ka nagdula",
    kicker: "Lanes ug roles",
    title: "Asa ka nagdula",
    rateLimited:
      "Daghan kaayong request sa OpenDota karon, mao nga dili ma-load ang lane data. Sulayi pag-usab human sa usa ka minuto.",
    unavailable: "Dili available ang lane data karon. Sulayi pag-usab unya.",
    positions: "Mga hero sa matag position",
  },
  teammates: {
    kicker: "Mga kauban",
    title: "Kinsa imong kauban sa pagdula",
    label: "Mga kauban",
    unavailable:
      "Dili available ang stats sa mga kauban karon. Dili apektado ang uban pang bahin sa imong overview; sulayi pag-usab human sa usa ka minuto.",
    empty:
      "Wala pay kauban. Mogawas diri ang mga tawo nga imong kauban sa public nga mga duwa. Pwede usab nimo",
    trackFriend: "i-track ang usa ka higala",
    emptyEnd: ".",
  },
  patch: {
    loading: "Gi-load ang giusab sa pinakabag-ong patch para nimo",
    kicker: "Pinakabag-ong patch",
    title: "Unsa ang nausab para nimo",
    unavailable: "Dili available ang pinakabag-ong patch notes karon.",
    patchKicker: "Patch {version}",
    changed: {
      one: "Giusab sa {version} ang 1 ka hero nga imong gidula",
      other: "Giusab sa {version} ang {n} ka hero nga imong gidula",
    },
    unchanged: "Wala giusab sa {version} ang mga hero nga imong gidula",
    description:
      "Mga hero nga imong gidula: 3+ ka ranked nga duwa sa katapusang 90 ka adlaw, o gi-star sa usa ka patch page.",
    seeAll: "Tan-awa tanang {n} sa {version}",
    allOf: "Tanan sa {version}",
    heroLink: "Unsa ang nausab kang {hero} sa {version}",
    moreChanges: { one: "1 pa ka kausaban", other: "{n} pa ka kausaban" },
    noGamesSince: "walay ranked nga duwa sukad",
    tooFewToCompare: "{before} sa wala pa, {after} sukad (kulang pa aron itandi)",
    compared: "({before} sa wala pa, {after} sukad) · KDA",
  },
};
