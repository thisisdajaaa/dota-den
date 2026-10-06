import type { MessageTree } from "../../translate";
import type { patches as en } from "../en/patches";

export const patches: MessageTree<typeof en> = {
  title: "Patch notes",
  kicker: "Patch hub",
  description:
    "Ang opisyal nga patch notes sa Dota 2 sa orihinal nga pagkasulat sa Valve, ug naa sa ibabaw ang mga kausaban nga importante sa imong mga hero.",
  loading: "Gi-load ang patch notes",
  latest: {
    kicker: "Pinakabag-ong patch",
    released: "Gi-release niadtong {date} · {heroes} ka hero ug {items} ka item ang nausab",
    read: "Basaha ang patch {version}",
    yoursChanged: "{count} sa imong mga hero ang nausab",
    noneChanged: "Walay nausab sa mga hero nga imong gidula bag-o lang niining patch",
    yourHeroesHelp:
      "Ang “imong mga hero” kay mga hero nga naa kay 3+ ka ranked nga duwa sa miaging 90 ka adlaw, apil ang imong gi-star sa usa ka patch page.",
  },
  unavailable: {
    title: "Wala pay patch notes karon",
    body: "Dili namo maabot ang patch feed sa Valve. Mabasa nimo sa opisyal nga site samtang.",
  },
  list: {
    all: "Tanang patch",
    older: "Mas karaan nga patch",
    partial: "Bahin ra ang na-import",
    linkOnly: "Link ra",
    heroes: "hero",
    items: "item",
    general: "kinatibuk-an",
    backToLatest: "Balik sa pinakabag-o",
  },
  detail: {
    metaTitle: "Patch {version}",
    allPatches: "Tanang patch",
    kicker: "Gameplay update",
    released: "Gi-release niadtong {date} · {heroes} ka hero · {items} ka item",
    official: "Opisyal nga notes sa dota2.com",
    failed:
      "Wala namo ma-import kini nga notes. Palihug basaha sa opisyal nga site gamit ang link sa ibabaw.",
    partial:
      "Naay mga bahin niini nga notes nga wala ma-import, busa basin kulang kini nga page. Kompleto ang naa sa opisyal nga page.",
    sections: "Mga seksyon",
    nav: {
      yourHeroes: "Imong mga hero ({n})",
      general: "Kinatibuk-an",
      heroes: "Mga hero ({n})",
      items: "Mga item ({n})",
      neutralItems: "Mga neutral item ({n})",
      creeps: "Mga creep",
    },
    forYou: "Para nimo",
    yourHeroesTitle: "Mga kausaban sa imong mga hero",
    yourHeroesHelp:
      "Mga hero nga imong gidula og 3+ ka ranked nga duwa sa miaging 90 ka adlaw, apil ang imong gi-star.",
    generalTitle: "Kinatibuk-ang mga kausaban",
    heroesTitle: "Mga hero",
    jumpToHero: "Adto sa hero",
    itemsTitle: "Mga item",
    neutralItemsTitle: "Mga neutral item",
    creepsTitle: "Mga neutral creep",
    footer:
      "Patch notes © Valve Corporation, gipakita sa orihinal nga pagkasulat. Gi-import niadtong {date} UTC{revision}.",
    revision: " (rebisyon {n})",
  },
  notFound: {
    title: "Wala makit-i ang patch",
    body: "Walay opisyal nga patch nga naay ingon ana nga version number.",
    seeAll: "Tan-awa ang tanang patch",
  },
  hero: {
    cohortTitle: "Imong mga ranked nga duwa niini nga hero",
    before: "30 ka adlaw sa wala pa",
    after: "Sukad niini nga patch",
    games: "{games} ka duwa · KDA {kda}",
    hint: "Daghan pang lain nga nausab (mga kauban, ang meta, imong role), busa isipa kini nga timaan, dili pruweba.",
    notEnough: "Kulang pa ang duwa sa duha ka bahin ({min}+ matag usa) aron ikumpara.",
    ability: "Ability #{id}",
    talents: "Talents",
  },
  item: { fallback: "Item #{id}" },
  watch: {
    watching: "Gibantayan na nimo ang {hero}",
    stopped: "Wala na nimo gibantayan ang {hero}",
    full: "Puno na ang imong watchlist (50 ka hero).",
    failed: "Dili ma-update ang imong watchlist.",
    watchLabel: "Bantayi ang {hero}",
    stopLabel: "Hunonga ang pagbantay sa {hero}",
    onList: "Naa sa imong watchlist",
    add: "Idugang sa imong watchlist",
  },
};
