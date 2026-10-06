import type { MessageTree } from "../../translate";
import type { patches as en } from "../en/patches";

export const patches: MessageTree<typeof en> = {
  title: "Patch notes",
  kicker: "Patch hub",
  description:
    "Ang opisyal na patch notes ng Dota 2 sa orihinal na salita ng Valve, at nasa itaas ang mga pagbabagong mahalaga sa mga hero mo.",
  loading: "Nilo-load ang patch notes",
  latest: {
    kicker: "Pinakabagong patch",
    released: "Inilabas noong {date} · {heroes} hero at {items} item ang nagbago",
    read: "Basahin ang patch {version}",
    yoursChanged: "{count} sa mga hero mo ang nagbago",
    noneChanged: "Walang nagbago sa mga hero na nilaro mo kamakailan sa patch na ito",
    yourHeroesHelp:
      "Ang “mga hero mo” ay mga hero na may 3+ ranked na laro ka sa nakaraang 90 araw, pati ang mga ini-star mo sa isang patch page.",
  },
  unavailable: {
    title: "Hindi available ang patch notes ngayon",
    body: "Hindi namin maabot ang patch feed ng Valve. Mababasa mo muna ang mga ito sa opisyal na site.",
  },
  list: {
    all: "Lahat ng patch",
    older: "Mga lumang patch",
    partial: "Bahagyang na-import",
    linkOnly: "Link lang",
    heroes: "hero",
    items: "item",
    general: "pangkalahatan",
    backToLatest: "Bumalik sa pinakabago",
  },
  detail: {
    metaTitle: "Patch {version}",
    allPatches: "Lahat ng patch",
    kicker: "Gameplay update",
    released: "Inilabas noong {date} · {heroes} hero · {items} item",
    official: "Opisyal na notes sa dota2.com",
    failed:
      "Hindi namin na-import ang notes na ito. Basahin mo na lang sa opisyal na site gamit ang link sa itaas.",
    partial:
      "May mga bahagi ng notes na ito na hindi na-import, kaya baka kulang ang page na ito. Kumpleto ang nasa opisyal na page.",
    sections: "Mga seksyon",
    nav: {
      yourHeroes: "Mga hero mo ({n})",
      general: "Pangkalahatan",
      heroes: "Mga hero ({n})",
      items: "Mga item ({n})",
      neutralItems: "Mga neutral item ({n})",
      creeps: "Mga creep",
    },
    forYou: "Para sa iyo",
    yourHeroesTitle: "Mga pagbabago sa mga hero mo",
    yourHeroesHelp:
      "Mga hero na nilaro mo nang 3+ ranked na laro sa nakaraang 90 araw, pati ang mga ini-star mo.",
    generalTitle: "Mga pangkalahatang pagbabago",
    heroesTitle: "Mga hero",
    jumpToHero: "Pumunta sa hero",
    itemsTitle: "Mga item",
    neutralItemsTitle: "Mga neutral item",
    creepsTitle: "Mga neutral creep",
    footer:
      "Patch notes © Valve Corporation, ipinapakita sa orihinal na salita. Na-import noong {date} UTC{revision}.",
    revision: " (rebisyon {n})",
  },
  notFound: {
    title: "Hindi nahanap ang patch",
    body: "Walang opisyal na patch na may ganyang version number.",
    seeAll: "Tingnan lahat ng patch",
  },
  hero: {
    cohortTitle: "Ang mga ranked na laro mo sa hero na ito",
    before: "30 araw bago",
    after: "Mula sa patch na ito",
    games: "{games} laro · KDA {kda}",
    hint: "Marami pang ibang nagbabago (mga kakampi, ang meta, ang role mo), kaya ituring mo itong pahiwatig, hindi patunay.",
    notEnough: "Kulang pa ang laro sa magkabilang panig ({min}+ bawat isa) para maikumpara.",
    ability: "Ability #{id}",
    talents: "Talents",
  },
  item: { fallback: "Item #{id}" },
  watch: {
    watching: "Binabantayan mo na ang {hero}",
    stopped: "Hindi mo na binabantayan ang {hero}",
    full: "Puno na ang watchlist mo (50 hero).",
    failed: "Hindi ma-update ang watchlist mo.",
    watchLabel: "Bantayan ang {hero}",
    stopLabel: "Itigil ang pagbantay sa {hero}",
    onList: "Nasa watchlist mo",
    add: "Idagdag sa watchlist mo",
  },
};
