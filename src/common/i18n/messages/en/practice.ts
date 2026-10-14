/** UI copy for the weekly practice plan. */
export const practice = {
  title: "Practice plan",
  kicker: "This week",
  basic: "Not enough data yet for a personal plan, so here are the basics.",
  empty: "No steps left this week. A new plan comes next week.",
  swap: "Swap step {n}",
  dismiss: "Dismiss step {n}",
  updateFailed: "Couldn't change your plan.",
  openMatch: "Open the match",
  status: { done: "Done", broken: "Broken this week", open: "In progress" },
  step: {
    practiceHero: "Play {hero} in {target} ranked games",
    stopAfterLosses: "End the session after {streak} losses in a row",
    reviewLoss: "Review your {hero} loss from {date}",
    logMmr: "Log your MMR after each session",
  },
  why: {
    highRank: "{rate}% win rate at high ranks as Pos {position} ({games} games).",
    contest: "Picked or banned in {rate}% of recent pro drafts.",
    metaList: "Near the top of the Pos {position} hero list.",
    counter:
      "It does well against {nemesis}, who beats you in about {loss}% of your games against them ({games} games).",
    stopAfterLosses:
      "After {streak} losses in a row you won {after}% of the {afterGames} ranked games you played on, against {baseline}% overall ({baselineGames} games).",
    reviewLoss:
      "Your latest ranked loss ({kills}/{deaths}/{assists}). Add a note or the “reviewed” tag on the match page to tick it.",
    logMmr: "You logged MMR after {logged} of your last {sessions} ranked sessions.",
    logMmrBasic: "Logging after each session lets your sessions show your real MMR change.",
  },
  progress: {
    heroGames: "{played} / {target} games",
    kept: "Kept in all {sessions} sessions so far",
    broken: "Played on after {streak} losses in {broken} of {sessions} sessions",
    noSessions: "No ranked sessions yet this week",
    reviewed: "Reviewed",
    notReviewed: "Not reviewed yet",
    sessionsLogged: "{logged} / {total} sessions logged",
  },
  gaps: {
    tiltSample:
      "Stopping after losses is suggested once you have {min} ranked games played after 2 losses in a row (you have {games}).",
    noRole: "Hero suggestions need a clear role from your recent lanes.",
    noHeroes: "No hero suggestions for your role right now.",
  },
} as const;
