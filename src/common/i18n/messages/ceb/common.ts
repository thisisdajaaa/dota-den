import type { MessageTree } from "../../translate";
import type { common as en } from "../en/common";

export const common: MessageTree<typeof en> = {
  brand: { home: "Home sa Dota Den" },
  nav: {
    main: "Panguna",
    overview: "Kinatibuk-an",
    matches: "Mga duwa",
    heroes: "Mga hero",
    mmr: "MMR journal",
    sessions: "Mga session",
    report: "Battle report",
    together: "Magkauban",
    meta: "Meta",
    guides: "Mga giya",
    players: "Mga player",
    patches: "Mga patch",
    draft: "Draft",
    live: "Live",
    leaderboards: "Leaderboards",
    account: "Account",
    admin: "Admin",
    more: "Uban pa",
  },
  auth: {
    signIn: "Mo-sign in",
    signInSteam: "Mo-sign in gamit ang Steam",
    signOut: "Mo-sign out",
  },
  footer: {
    disclaimer:
      "Ang Dota Den kay dili opisyal nga proyekto sa mga fan. Dili kini konektado o gi-endorso sa Valve Corporation. Ang Dota 2 kay rehistradong trademark sa Valve Corporation. Ang data sa mga duwa gikan sa OpenDota kung naa; ang patch notes naka-link sa opisyal nga gigikanan niini.",
  },
  language: { label: "Pinulongan", saved: "Nausab ang pinulongan" },
  actions: {
    save: "I-save",
    saving: "Gi-save…",
    saved: "Na-save",
    cancel: "Kanselahon",
    edit: "Usba",
    delete: "Papasa",
    retry: "Sulayi pag-usab",
    close: "Sirad-i",
  },
  errors: {
    generic: "Naay sayop. Palihug sulayi pag-usab.",
    network: "Problema sa network. Susiha ang imong koneksyon.",
    unavailable: "Dili available karon.",
  },
};
