/** UI copy and push notification text for the notifications feature. */
export const notifications = {
  card: {
    title: "Notifications",
    description:
      "Get a nudge on this device when there's something worth a look: a recap of your last session, your week, or a patch that changed your heroes. At most a few a week, once a day after your games sync.",
    unavailable: "Notifications aren't available on Dota Den yet.",
    unsupported: "This browser can't show notifications from websites.",
    needsInstall:
      "On iPhone and iPad, add Dota Den to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications.",
    blocked:
      "Notifications are blocked for Dota Den in this browser. Allow them in the browser's site settings, then reload this page.",
    turnOn: "Turn on for this device",
    turnOff: "Turn off for this device",
    test: "Send a test",
    turnedOn: "Notifications are on for this device.",
    turnedOff: "Notifications are off for this device.",
    turnOnFailed: "Couldn't turn on notifications. Try again.",
    saveFailed: "Couldn't save that. Try again.",
    testSent: "Test sent. It should appear in a few seconds.",
    testFailed: "Couldn't send a test notification.",
    thisDeviceOn: "On for this device.",
    otherDevices: {
      one: "On for 1 other device.",
      other: "On for {n} other devices.",
    },
    kindsTitle: "What to send (all your devices)",
  },
  prompt: {
    label: "Notifications",
    text: "Get a recap on your phone after each session.",
    action: "Turn on notifications",
    dismiss: "Hide this",
  },
  kinds: {
    session_recap: {
      label: "Session recap",
      help: "After a session ends: your record and a link to the recap.",
    },
    weekly_recap: {
      label: "Weekly recap",
      help: "On Mondays, if you played ranked last week.",
    },
    patch_heroes: {
      label: "Patch changes your heroes",
      help: "When a new patch changes heroes you play.",
    },
  },
  push: {
    session: {
      title: "Last session: {wins}W {losses}L",
      body: "{games} on {heroes}. See what went well and what didn't.",
    },
    games: { one: "1 game", other: "{n} games" },
    weekly: {
      title: "Your week: {wins}W {losses}L",
      body: "{games} last week. See your weekly recap.",
    },
    rankedGames: { one: "1 ranked game", other: "{n} ranked games" },
    patch: {
      title: "Patch {version} changes your heroes",
      body: "{heroes} changed. See what's different and how you've done since.",
    },
    list: "{items} and {last}",
    listMore: "{items} and {more} more",
    heroFallback: "Hero #{id}",
    test: {
      title: "Notifications are working",
      body: "You'll hear from Dota Den here. Tap to open your notification settings.",
    },
  },
};
