/** UI copy for the meta feature. */
export const meta = {
  title: "Meta",
  counts: {
    games: { one: "1 game", other: "{n} games" },
    otherGames: {
      one: "1 other game had no lane data and isn't counted.",
      other: "{n} other games had no lane data and aren't counted.",
    },
    proDrafts: { one: "1 pro draft", other: "{n} pro drafts" },
    picks: { one: "1 pick", other: "{n} picks" },
    bans: { one: "1 ban", other: "{n} bans" },
  },
  unavailable: {
    heroStats: {
      busy: "OpenDota is getting a lot of requests right now, so hero stats can't be loaded. Try again in a minute.",
      down: "Hero stats are unavailable right now. Try again shortly.",
    },
    proLaneData: {
      busy: "OpenDota is getting a lot of requests right now, so pro lane data can't be loaded. Try again in a minute.",
      down: "Pro lane data is unavailable right now. Try again shortly.",
    },
  },
  page: {
    kicker: "Meta",
    title: "What's strong right now",
    description:
      "The heroes and lane partners doing best for each role in recent high-rank games and tournaments, with this patch's changes.",
    guides: "Hero guides",
    pickRole: "Which role do you play?",
    loading: "Loading meta",
    loadingTopHeroes: "Loading top heroes",
    loadingTips: "Loading patch tips",
    loadingDuos: "Loading lane duos",
  },
  patchLine: {
    none: "No patch notes imported yet.",
    unavailable: "Patch info is unavailable right now.",
    latest: "Latest patch:",
    released:
      ", released {date}. Public stats cover recent games and may include some from before it.",
  },
  yourRole: {
    title: "Your role",
    unavailable:
      "Your recent lanes are unavailable right now, so we can't tell your role. Pick one below.",
    tooFewOne:
      "We can't tell your role yet: {games} from the last {days} days has lane data, and we need at least {min}. Lane data only exists for games OpenDota has parsed. Pick a role below.",
    tooFewOther:
      "We can't tell your role yet: {games} from the last {days} days have lane data, and we need at least {min}. Lane data only exists for games OpenDota has parsed. Pick a role below.",
    basedOn: "Based on your last {games} with lane data (past {days} days).",
    byPosition: "Games by position",
    positionGames: "{pos}: {games}",
  },
  roles: {
    tabsLabel: "Position",
    you: "(you)",
    chooseRole: "Choose your role",
    core: "Core",
    support: "Support",
  },
  topHeroes: {
    kicker: "Right now",
    title: "Top heroes: {name}",
    titleShort: "Top heroes",
    description:
      "Ranked by win rate at Ancient to Immortal and in this lane, with small samples pulled toward 50%, plus a small boost for heroes contested in tournaments.",
    publicSource: "High-rank and lane stats: OpenDota public games, updated {ago}.",
    proOk: "Tournaments: {drafts} in the last {days} days, updated {ago}.",
    proTooFew: "Tournaments: only {drafts} in the last {days} days, too few to use.",
    proUnavailable: "Tournament data is unavailable right now.",
    laneUnavailable:
      "Lane data is unavailable right now, so this list can't check which lane each hero is played in. It uses the hero's usual role instead.",
    notEnough: "Not enough data to rank heroes for this role right now. Try again later.",
    highRank: "win rate at high ranks · {games}",
    laneRate: "win rate · {games} ({share} of its games are in this lane)",
    laneNoData: "{lane}: lane data unavailable",
    tournaments: "Tournaments: {picks} · {bans} in {drafts} ({contest} contested)",
    trendTitle: "Change in share of public picks, last 3 days vs earlier in the week",
    rising: "Rising",
    falling: "Falling",
  },
  tips: {
    kicker: "Patch {version}",
    kickerShort: "Patch",
    title: "Patch tips",
    description: "What changed and what's moving for the top {n} heroes in this role.",
    footerUnavailable: "Patch notes are unavailable right now, so patch changes aren't included.",
    footerNone: "No patch notes imported yet, so patch changes aren't included.",
    footerOk: "Patch changes are Valve's original wording; open the patch page for the full notes.",
    empty: "No patch changes, big pick trends or standout numbers for these heroes right now.",
    seeAll: "See all {n} changes",
    seeNotes: "See the patch notes",
    needStats: "Patch tips need the hero stats, which are unavailable right now. You can still",
    readNotes: "read the patch notes",
    changed: "Changed in {version}: {line}",
    rising:
      "Rising: picked {pct} more often in public games over the last 3 days than earlier in the week",
    falling:
      "Falling: picked {pct} less often in public games over the last 3 days than earlier in the week",
    contested:
      "Contested in tournaments: picked or banned in {pct} of {drafts} pro drafts over the last {days} days",
    lane: "Wins {pct} of {games} public games played in the {lane}",
  },
  duos: {
    kicker: "Lane partners",
    title: "Strongest lane duos",
    soloLane: "Mid is a solo lane, so there are no lane duos to show.",
    description:
      "Two heroes from the same team sharing the {lane}, in pro matches over the last {days} days. Pairs with fewer than 8 games are left out.",
    source: "Source: OpenDota pro match database, updated {ago}.",
    empty: "No {lane} pair has enough pro games yet.",
    rate: "{rate} win rate · {games}",
  },
} as const;
