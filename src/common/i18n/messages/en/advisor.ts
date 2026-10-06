/** UI copy for the advisor feature. */
export const advisor = {
  kicker: "Your pool",
  kickerRole: "Your pool · {short} · {name}",
  title: "Heroes to add",
  noRole: "Play a few more games with lane data so we can tell which role you play.",
  unavailable: "Suggestions are unavailable right now. Try again in a few minutes.",
  descNemeses:
    "Strong at high ranks for your role, favouring heroes that beat the ones you lose to most:",
  descPlain: "Strong at high ranks for your role, and not already in your pool.",
  footer:
    "From your last {days} days, recent high-rank games and pro games. Win rates from small samples are pulled toward 50%.",
  none: "No suggestions: you already play the strongest heroes for your role.",
  beats: "Beats",
  beatsDetail: "{rate} in {games} (you lose to {hero} {lossRate} of the time)",
  highRank: "{rate} win rate at high ranks ({games})",
  contest: "Picked or banned in {rate} of pro drafts",
  played: { one: "You've played it once lately", other: "You've played it {n} times lately" },
  counts: {
    games: { one: "1 game", other: "{n} games" },
    proGames: { one: "1 pro game", other: "{n} pro games" },
  },
} as const;
