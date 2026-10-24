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
    privacyLink: "Unsaon namo pagdumala ang imong data",
    lookupLabel: "O pangitaa ang bisan kinsa nga player, bisan wala naka-sign in",
    example: "Tan-awa ang pananglitan nga profile",
    exampleWho: "Yatoro, usa ka pro carry",
  },
  patch: {
    aria: "Pinakabag-ong patch {version}: basaha ang notes",
    kicker: "Pinakabag-ong patch",
    changed: "{heroes} ug {items} ang giusab",
    heroesAria: "Pipila sa mga hero nga giusab",
    read: "Basaha ang patch notes",
    topChanges: "Mga hero nga pinakadaghang giusab",
    noHeroChanges: "Walay kausaban sa mga hero niini nga patch.",
    more: { one: "+1 pa ka linya", other: "+{n} pa ka linya" },
    metaCta: "Tan-awa kung unsa ang kusgan karon",
  },
  preview: {
    label: "Preview sa Meta page gamit ang data karong adlawa",
    address: "dota-den.com/meta",
    kicker: "Meta",
    title: "Unsa ang kusgan karon",
    live: "Tinuod nga data",
    source: "High-rank nga duwa sa OpenDota · na-update {ago}",
    sourcePositions: "Duwa nga Ancient–Immortal sa STRATZ, {range} · na-update {ago}",
    open: "Ablihi ang Meta",
    unavailable:
      "Dili available ang hero stats karon. Makita kini sa Meta page kung motubag na ang OpenDota.",
    loading: "Nag-load sa meta karong adlawa",
  },
  features: {
    kicker: "Unsa ang imong makuha",
    title: "Usa ka lugar para sa imong Dota tali sa mga duwa",
    party: {
      title: "Solo vs party, tinuod gyud",
      body: "Gibahin ang imong mga match sa solo, party ug unknown, uban kung asa gikan ang matag label. Ang kulang nga data dili gyud iihap nga solo.",
      cta: "Mo-sign in aron makita ang imo",
    },
    draft: {
      title: "Draft practice",
      body: "Pick ug ban drills ug challenges sama sa Captain's Mode, ikaw ra o sa usa ka room uban sa mga higala. Adunay rason, walay peke nga win odds.",
      cta: "Sugdi og draft",
    },
    guides: {
      title: "Mga hero guide",
      body: "Unsa ang gipalit sa mga pro sa matag hero ug unsa ang hitsura sa maayong duwa, gikan sa tinuod nga pro matches.",
      cta: "Tan-awa ang mga guide",
    },
    live: {
      title: "Tan-awa ang Dota nga live",
      body: "Mga live nga Dota 2 stream nga matan-aw nimo dinhi uban ang chat, ang mga streamer nga imong gi-follow, ug ang mga pro ug top public game nga nahitabo karon.",
      cta: "Tan-awa ang live",
    },
  },
};
