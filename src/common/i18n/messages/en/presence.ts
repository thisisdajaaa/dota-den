/** UI copy for "Friends playing now" (Steam presence) on the overview. */
export const presence = {
  title: "Friends playing now",
  count: { one: "1 friend in Dota 2", other: "{n} friends in Dota 2" },
  inMatch: "In a match",
  inGame: "Playing Dota 2",
  watchLive: "Watch live",
  viewProfile: "View profile",
  link: "{name}: {status}. {action}",
  unknownName: "Player {id}",
  source: {
    steam_friends: "From your Steam friends list.",
    tracked_and_teammates:
      "Your Steam friends list is private, so this shows players you track and frequent teammates.",
  },
} as const;
