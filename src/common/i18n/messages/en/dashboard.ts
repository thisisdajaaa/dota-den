/** UI copy for the overview (dashboard) page. */
export const dashboard = {
  title: "Dashboard",
  loading: "Loading dashboard",
  showing: "Showing {shown} of your {total} matches",
  noneInView: "No matches in this view. Try a wider time range.",
  keyStats: "Key stats",
  winRate: "Win rate",
  soloWinRate: "Solo win rate",
  partyWinRate: "Party win rate",
  kdaRatio: "KDA ratio",
  wins: { one: "1 win", other: "{n} wins" },
  losses: { one: "1 loss", other: "{n} losses" },
  soloGames: { one: "1 solo game", other: "{n} solo games" },
  partyGames: { one: "1 party game", other: "{n} party games" },
  tooFew: " · too few to judge",
  averages: "Avg {kills} kills · {deaths} deaths · {assists} assists",
  empty: {
    first_sync: {
      title: "Summoning your match history…",
      body: "We're importing your games from OpenDota. This page updates automatically.",
    },
    fetching: {
      title: "OpenDota is fetching your match history",
      body: "We've asked OpenDota to pull your games from Steam. This usually takes a few minutes, sometimes longer for big histories. You can leave this page open: it checks again automatically.",
    },
    no_public_data: {
      title: "No public matches found yet",
      body: "OpenDota still has no games for this account. In Dota 2, go to Settings → Options → Social and turn on “Expose Public Match Data”. We ask OpenDota to re-fetch your history every few hours, and it also picks up games you play from now on.",
    },
  },
  lanes: {
    loading: "Loading where you play",
    kicker: "Lanes and roles",
    title: "Where you play",
    rateLimited:
      "OpenDota is getting a lot of requests right now, so lane data can't be loaded. Try again in a minute.",
    unavailable: "Lane data is unavailable right now. Try again shortly.",
    positions: "Heroes in each position",
  },
  teammates: {
    kicker: "Teammates",
    title: "Who you play with",
    label: "Teammates",
    unavailable:
      "Teammate stats are unavailable right now. The rest of your overview is unaffected; try again in a minute.",
    empty: "No teammates yet. People you share public matches with show up here. You can also",
    trackFriend: "track a friend",
    emptyEnd: ".",
  },
  patch: {
    loading: "Loading what the latest patch changed for you",
    kicker: "Latest patch",
    title: "What changed for you",
    unavailable: "The latest patch notes are unavailable right now.",
    patchKicker: "Patch {version}",
    changed: {
      one: "{version} changed 1 hero you play",
      other: "{version} changed {n} heroes you play",
    },
    unchanged: "{version} didn't change the heroes you play",
    description:
      "Heroes you play: 3+ ranked games in the last 90 days, or starred on a patch page.",
    seeAll: "See all {n} in {version}",
    allOf: "All of {version}",
    heroLink: "What changed for {hero} in {version}",
    moreChanges: { one: "1 more change", other: "{n} more changes" },
    noGamesSince: "no ranked games since",
    tooFewToCompare: "{before} before, {after} since (too few to compare)",
    compared: "({before} before, {after} since) · KDA",
  },
} as const;
