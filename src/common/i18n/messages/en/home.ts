/** UI copy for the home feature (the landing page). */
export const home = {
  authErrors: {
    state_mismatch: "Your sign-in session expired or was started in another tab. Please try again.",
    provider_unavailable: "Steam didn't respond. Please try again in a moment.",
    fallback: "We couldn't verify your Steam sign-in. Please try again.",
  },
  alerts: {
    deletedTitle: "Your account was deleted",
    deletedBody: "Everything Dota Den kept about you has been removed. Thanks for trying it.",
    signedOutTitle: "You're signed out of Dota Den",
    signedOutBefore:
      "Steam keeps you signed in on its own site, so signing in here again uses the same Steam account. To switch accounts, sign out of Steam first: ",
    signedOutLink: "open Steam Community",
    signedOutMiddle: ", click your account name at the top right and choose ",
    signedOutSteamButton: "Sign out",
    signedOutAfter: ". Then come back and sign in with the other account.",
    signInRequiredTitle: "Sign in required",
    signInRequiredBody: "Sign in through Steam to view that page.",
    signInFailedTitle: "Sign-in failed",
  },
  hero: {
    kicker: "Unofficial Dota 2 companion",
    titleBefore: "Climb with ",
    titleHighlight: "clarity",
    titleAfter: ", not guesswork.",
    body: "See how you really play solo versus with your stack, what each patch changed for your heroes, and practice drafts before the game that counts.",
    signIn: "Sign in through Steam",
    privacy: "We never see your password. Your data stays private by default.",
  },
  patch: {
    aria: "Latest patch {version}: read the notes",
    kicker: "Latest patch",
    changed: "{heroes} heroes and {items} items changed",
    heroesAria: "Some of the heroes changed",
    read: "Read the patch notes",
  },
  loop: {
    kicker: "The loop",
    title: "From patch day to your next session",
    patch: { title: "Read the patch", body: "See which changes touch your hero pool." },
    draft: { title: "Draft with friends", body: "Practice Captain's Mode-style picks and bans." },
    review: { title: "Review together", body: "Solo and party results, with sample sizes." },
    experiment: {
      title: "Set the next experiment",
      body: "Pick one thing to test next session.",
    },
  },
  features: {
    title: "Features",
    party: {
      title: "Solo vs party, honestly",
      body: "Every match is labelled solo, party or unknown, with its source. Missing data is never counted as solo.",
    },
    patches: {
      title: "Patch hub",
      body: "Official patch notes linked to their source, filtered to the heroes you actually play.",
    },
    draft: {
      title: "Draft practice",
      body: "Pick/ban drills locally or with friends, with transparent reasons instead of fake win odds.",
    },
  },
} as const;
