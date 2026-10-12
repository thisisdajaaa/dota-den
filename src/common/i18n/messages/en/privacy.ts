/** UI copy for the privacy feature (the Account page). */
export const privacy = {
  title: "Account",
  kicker: "Settings and data",
  description:
    "Choose notifications, your Discord feed and the weekly email, download what Dota Den keeps about you, or delete your account and all of it.",
  download: {
    title: "Download your data",
    button: "Download",
    json: {
      label: "Everything (JSON)",
      hint: "Account, MMR log, medals, notes, drafts, tracked players and matches",
    },
    matches: { label: "Matches (CSV)", hint: "One row per imported match" },
    mmr: { label: "MMR log (CSV)", hint: "Every MMR entry you logged" },
  },
  delete: {
    title: "Delete your account",
    removes:
      "Removes your account, sign-ins, MMR log, medal history, session notes and goals, tracked players, draft results and challenge streak, your Discord webhook, and your imported matches.",
    friends:
      "Drafts you played with a friend stay in their history, with your name and picture removed.",
    backups: "Encrypted backups are kept for 30 days, then your data is gone from them too.",
    opendota:
      "Your public Dota matches stay on OpenDota; if you sign in again, they'd be imported again as a new account.",
    confirmBefore: "Type ",
    confirmAfter: " to confirm",
    deleting: "Deleting…",
    button: "Delete my account",
    failed: "Couldn't delete your account right now. Nothing was removed; try again.",
  },
} as const;
