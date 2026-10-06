import type { MessageTree } from "../../translate";
import type { dashboard as en } from "../en/dashboard";

export const dashboard: MessageTree<typeof en> = {
  title: "Dashboard",
  loading: "Gi-load ang dashboard",
  showing: "Gipakita ang {shown} sa imong {total} ka duwa",
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
    no_public_data: {
      title: "Wala pay nakit-ang public nga duwa",
      body: "Wala pa gihapoy duwa ang OpenDota para niini nga account. Sa Dota 2, adto sa Settings → Options → Social ug i-on ang “Expose Public Match Data”. Gihangyo namo ang OpenDota nga kuhaon pag-usab ang imong kasaysayan matag pipila ka oras, ug makuha usab niini ang mga duwa nga imong dulaon sugod karon.",
    },
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
