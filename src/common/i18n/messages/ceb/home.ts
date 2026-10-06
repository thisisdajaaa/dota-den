import type { MessageTree } from "../../translate";
import type { home as en } from "../en/home";

export const home: MessageTree<typeof en> = {
  authErrors: {
    state_mismatch:
      "Na-expire ang imong sign-in session o gisugdan kini sa laing tab. Palihug sulayi pag-usab.",
    provider_unavailable: "Wala motubag ang Steam. Sulayi pag-usab unya-unya.",
    fallback: "Dili namo ma-verify ang imong Steam sign-in. Palihug sulayi pag-usab.",
  },
  alerts: {
    deletedTitle: "Na-delete na ang imong account",
    deletedBody:
      "Natangtang na ang tanan nga gitipigan sa Dota Den bahin nimo. Salamat sa pagsulay niini.",
    signedOutTitle: "Naka-sign out na ka sa Dota Den",
    signedOutBefore:
      "Ang Steam magpabilin nimo nga naka-sign in sa ilang kaugalingong site, mao nga kung mo-sign in ka pag-usab diri, mao ra gihapon nga Steam account ang gamiton. Aron mobalhin og account, mo-sign out sa una sa Steam: ",
    signedOutLink: "ablihi ang Steam Community",
    signedOutMiddle: ", i-click ang imong account name sa tuong ibabaw ug pilia ang ",
    signedOutSteamButton: "Sign out",
    signedOutAfter: ". Dayon balik diri ug mo-sign in gamit ang laing account.",
    signInRequiredTitle: "Kinahanglan ka mo-sign in",
    signInRequiredBody: "Mo-sign in pinaagi sa Steam aron makita ang maong page.",
    signInFailedTitle: "Napakyas ang sign-in",
  },
  hero: {
    kicker: "Dili opisyal nga kauban sa Dota 2",
    titleBefore: "Saka nga ",
    titleHighlight: "klaro",
    titleAfter: ", dili tag-an.",
    body: "Tan-awa kung giunsa nimo pagdula gyud nga solo kontra sa imong stack, unsa ang giusab sa matag patch sa imong mga hero, ug pag-practice og draft una sa duwa nga importante.",
    signIn: "Mo-sign in pinaagi sa Steam",
    privacy: "Dili namo makita ang imong password. Private ang imong data isip default.",
  },
  patch: {
    aria: "Pinakabag-ong patch {version}: basaha ang notes",
    kicker: "Pinakabag-ong patch",
    changed: "{heroes} ka hero ug {items} ka item ang giusab",
    heroesAria: "Pipila sa mga hero nga giusab",
    read: "Basaha ang patch notes",
  },
  loop: {
    kicker: "Ang loop",
    title: "Gikan sa patch day hangtod sa imong sunod nga session",
    patch: {
      title: "Basaha ang patch",
      body: "Tan-awa kung unsang mga kausaban ang makaapekto sa imong hero pool.",
    },
    draft: {
      title: "Draft uban sa mga higala",
      body: "Pag-practice og pick ug ban sama sa Captain's Mode.",
    },
    review: {
      title: "Review nga magkauban",
      body: "Resulta sa solo ug party, uban ang sample size.",
    },
    experiment: {
      title: "Ibutang ang sunod nga eksperimento",
      body: "Pili og usa ka butang nga sulayan sa sunod nga session.",
    },
  },
  features: {
    title: "Mga feature",
    party: {
      title: "Solo vs party, tinuod gyud",
      body: "Ang matag match adunay label nga solo, party o unknown, uban ang gigikanan. Ang kulang nga data dili gyud iihap nga solo.",
    },
    patches: {
      title: "Patch hub",
      body: "Opisyal nga patch notes nga naka-link sa gigikanan, gi-filter sa mga hero nga imong gidula gyud.",
    },
    draft: {
      title: "Draft practice",
      body: "Pick/ban drills nga ikaw ra o uban sa mga higala, adunay klarong rason imbes nga peke nga win odds.",
    },
  },
};
