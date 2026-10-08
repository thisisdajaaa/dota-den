/** Shared words and the app shell (navigation, header, footer). */
export const common = {
  brand: { home: "Dota Den home" },
  nav: {
    main: "Main",
    overview: "Overview",
    matches: "Matches",
    heroes: "Heroes",
    mmr: "MMR journal",
    sessions: "Sessions",
    report: "Battle report",
    together: "Together",
    meta: "Meta",
    guides: "Guides",
    players: "Players",
    patches: "Patches",
    draft: "Draft",
    live: "Live",
    leaderboards: "Leaderboards",
    account: "Account",
    admin: "Admin",
    more: "More",
  },
  auth: {
    signIn: "Sign in",
    signInSteam: "Sign in through Steam",
    signOut: "Sign out",
  },
  footer: {
    disclaimer:
      "Dota Den is an unofficial fan project. It is not affiliated with or endorsed by Valve Corporation. Dota 2 is a registered trademark of Valve Corporation. Match data is provided by OpenDota where available; patch notes link to their official source.",
  },
  language: { label: "Language", saved: "Language changed" },
  actions: {
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    retry: "Try again",
    close: "Close",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Network error. Check your connection.",
    unavailable: "Unavailable right now.",
  },
} as const;
