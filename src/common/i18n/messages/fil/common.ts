import type { MessageTree } from "../../translate";
import type { common as en } from "../en/common";

export const common: MessageTree<typeof en> = {
  brand: { home: "Home ng Dota Den" },
  nav: {
    main: "Pangunahin",
    overview: "Buod",
    matches: "Mga laro",
    heroes: "Mga hero",
    mmr: "MMR journal",
    sessions: "Mga session",
    report: "Battle report",
    together: "Magkasama",
    meta: "Meta",
    guides: "Mga gabay",
    players: "Mga player",
    patches: "Mga patch",
    draft: "Draft",
    live: "Live",
    leaderboards: "Leaderboards",
    account: "Ang data mo",
    admin: "Admin",
    more: "Iba pa",
  },
  auth: {
    signIn: "Mag-sign in",
    signInSteam: "Mag-sign in gamit ang Steam",
    signOut: "Mag-sign out",
  },
  footer: {
    disclaimer:
      "Ang Dota Den ay hindi opisyal na proyekto ng mga fan. Hindi ito kaugnay o inendorso ng Valve Corporation. Ang Dota 2 ay rehistradong trademark ng Valve Corporation. Ang data ng mga laro ay galing sa OpenDota kung mayroon; ang patch notes ay naka-link sa opisyal na pinagmulan nito.",
  },
  language: { label: "Wika", saved: "Napalitan ang wika" },
  actions: {
    save: "I-save",
    saving: "Sine-save…",
    saved: "Na-save",
    cancel: "Kanselahin",
    edit: "I-edit",
    delete: "Burahin",
    retry: "Subukan ulit",
    close: "Isara",
  },
  errors: {
    generic: "May nagkamali. Pakisubukan ulit.",
    network: "Problema sa network. Tingnan ang koneksyon mo.",
    unavailable: "Hindi available ngayon.",
  },
};
