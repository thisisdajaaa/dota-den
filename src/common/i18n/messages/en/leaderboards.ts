/** UI copy for the leaderboards feature. */
export const leaderboards = {
  boards: {
    drafts: "Draft games",
    challenges: "Draft challenges",
    rooms: "Friend rooms",
  },
  scopes: { friends: "Friends", everyone: "Everyone" },
  periods: { week: "This week", all: "All time" },
  rules: {
    drafts:
      "Ranked by finished drafts against the AI captain or in practice, then by best draft score. The draft score is your side's report card score from the draft outlook (0–100, 50 is average). Practice drafts, where you play both sides, have no score.",
    challenges:
      "Ranked by correct answers (graded Good or Excellent), then by best streak. Only your first answer to each puzzle counts.",
    rooms:
      "Ranked by finished room drafts, then by wins. Wins and losses are self-reported by the captains after the game and aren't verified; drafts with no reported result count as played only.",
  },
  weekStarts: "The week starts Monday 00:00 UTC.",
  units: {
    drafts: { one: "{n} draft", other: "{n} drafts" },
    challenges: { one: "{n} correct answer", other: "{n} correct answers" },
    rooms: { one: "{n} room draft", other: "{n} room drafts" },
    player: { one: "{n} player", other: "{n} players" },
    answer: { one: "1 answer", other: "{n} answers" },
  },
  cta: {
    drafts: "Start a draft",
    challenges: "Try a challenge",
    rooms: "Draft with a friend",
  },
  stats: {
    drafts: "Drafts",
    bestScore: "Best score",
    grade: "Grade {grade}",
    avgScore: "Avg score",
    correct: "Correct",
    bestStreak: "Best streak",
    accuracy: "Accuracy",
    ofAnswers: "of {answers}",
    wins: "Wins",
    selfReported: "self-reported",
    losses: "Losses",
  },
  board: {
    label: "{board} leaderboard",
    you: "You",
    rankUnknown: "Rank unknown",
    rowLabel: "Rank {rank}: {name}",
    rowLabelYou: "Rank {rank}: {name} (you)",
    inviteBefore: "Invite a friend: create a room at",
    inviteAfter: "and send them the link. Once they sign in and play, they show up here.",
    nobody: "Nobody has played yet.",
    nobodyWeek: "Nobody has played yet this week.",
    noAccountsTitle: "None of your friends have Dota Den accounts yet",
    noAccountsBody:
      "Friends are players you track, your OpenDota teammates and people you've drafted with in rooms, once they sign in here.",
    noAccounts: "None of your friends have Dota Den accounts yet.",
    friendsNotPlayed: "None of your friends have played yet.",
    friendsNotPlayedWeek: "None of your friends have played yet this week.",
    friendsIncomplete:
      "Some of your friends couldn't be loaded right now (OpenDota may be busy), so this board may be missing people.",
    yourPosition: "Your position",
    total: { one: "1 player on this board.", other: "{n} players on this board." },
    totalWeek: {
      one: "1 player on this board this week.",
      other: "{n} players on this board this week.",
    },
    notOnYet: "You're not on it yet.",
    notOnYetWeek: "You're not on it yet this week.",
  },
  rankedWeek: {
    kicker: "Last 7 days",
    title: "Ranked this week",
    description:
      "You and your friends (players you track, frequent teammates and room opponents), by ranked wins minus losses. MMR is the ±25-per-game estimate: Valve doesn't share real MMR.",
    empty: "No ranked games from you or your friends in the last 7 days.",
    you: "(you)",
    bestTitle: "Best this week: {hero} {record}",
    idle: "{n} didn't play ranked",
    unknown: "{n} couldn't be read (private data or OpenDota busy)",
    friendsIncomplete: "some friends couldn't be loaded",
  },
  standing: {
    kicker: "Leaderboards",
    title: "Your standing among friends",
    label: "Your standing",
    notPlayed: "Not played yet",
    unavailable: "Your standing is unavailable right now. The rest of your overview is unaffected.",
    loading: "Loading your standing",
  },
  visibility: {
    listed: "You're listed on the Everyone boards.",
    unlisted: "You're no longer listed publicly.",
    saveError: "Couldn't save that. Try again.",
    label: "Show me on the Everyone boards",
    help: "Off by default. Your friends see you on the Friends boards either way.",
  },
  page: {
    title: "Leaderboards",
    kicker: "Compete",
    description:
      "See who's drafting the most among your friends, or across Dota Den. Draft games, draft challenges and friend rooms each have their own board.",
    invite: "Invite a friend",
    loadingRanked: "Loading ranked this week",
    boardTabs: "Leaderboard",
    whoTabs: "Who",
    whenTabs: "When",
    everyoneNote:
      "Only players who chose to be listed appear on the Everyone boards (you always see your own row).",
    unavailableTitle: "This leaderboard is unavailable right now",
    unavailableBody: "Please try again in a minute. Your drafts and answers are still being saved.",
    loading: "Loading the leaderboard",
  },
} as const;
