/** UI copy and post text for the Discord feed. */
export const discord = {
  bot: {
    help: "Dota Den bot. Free: `/den me` (your week, form and heroes), `/den leaderboard` (this server's ranked wins this week), `/den lang`, `/den recap` (be in this server's Monday recap), `/den nudges` (stop-loss reminders here or by DM). Plus: `/den coach` (your latest AI match review), `/den ask` (Ask Den), `/den pick` (picks for a real draft). Server admins: `/den setup`. Link your Discord first: {url}/account",
    notLinked: "Link your Discord to Dota Den first (it takes a few seconds): {url}",
    serverOnly: "This one is per server: use it in a server channel.",
    slowDown: "Easy there, that's a lot of commands. Try again in a minute.",
    plusOnly:
      "That's a Dota Den Plus command. Free commands: `/den me`, `/den leaderboard`. Plus: {url}",
    error: "Something went wrong on our side. Try again in a bit.",
    langCurrent:
      "Your Dota Den language is {language}. Change it with `/den lang language:` ({choices}); it's the same setting as on the site.",
    langSet: "Done: Dota Den talks to you in {language} now, here and on the site.",
    meTitle: "{name} on Dota Den",
    week: "Last 7 days",
    weekValue: "{wins}W {losses}L ({rate}%)",
    noGames: "No games yet",
    form: "Last 10 games",
    heroes: "Most played (30 days)",
    record: "{wins}W {losses}L",
    footer: "From public match data you imported on Dota Den.",
    boardTitle: "Ranked wins this week",
    boardFooter: "Linked members who've used /den in this server. Last 7 days.",
    boardEmpty:
      "No ranked games this week from linked members here yet. Members show up after they use /den in this server.",
    coach: {
      title: "AI coach · {hero}",
      strength: "Strength",
      improve: "Work on",
      footer: "AI coach: it can be wrong. The numbers are from your match data.",
      no_match: "No imported match of yours to review yet. Play a game, or open Dota Den to sync.",
      unparsed: "The coach needs this replay parsed first. Request it on the match page: {url}",
      quota: "You've used this week's coach review.",
      resting: "The coach is resting (today's AI budget is spent). Try again later.",
      off: "The AI coach isn't set up on Dota Den right now.",
      failed: "The coach couldn't write this review. Try again later.",
    },
    ask: {
      footer: "Ask Den · {remaining} of {limit} questions left today (shared with the site)",
      quota:
        "You've used today's Ask Den questions (shared with the site). They come back at midnight, Manila time.",
      fallback: "Ask Den couldn't answer that from your data. Try asking it another way: {url}",
      resting: "Ask Den is resting (today's AI budget is spent). Try again later.",
      off: "Ask Den isn't set up on Dota Den right now.",
      failed: "Ask Den couldn't answer right now. Try again in a bit.",
    },
    pick: {
      title: "Pick for me",
      against: "Against: {heroes}",
      noEnemies: "No enemy picks given: your best heroes on your own record.",
      you: "you {wins}W {losses}L in {games}",
      vs: "vs {hero} {points} ({games} games)",
      with: "with {hero} {points} ({games} games)",
      footer:
        "Your record plus high-rank matchups (win-rate points, adjusted for sample size). Not a win chance.",
      footerOwn:
        "High-rank matchups are unavailable right now, so this is your own record only. Not a win chance.",
      unknown: "Couldn't find these heroes: {names}. Pick them from the list as you type.",
      none: "Not enough games on your heroes yet (3 or more each). More on the site: {url}",
      failed: "Couldn't work out picks right now. Try again in a bit.",
    },
    recap: {
      on: "You're in this server's Monday recap: your ranked record last week, by name. Turn it off any time with `/den recap on:false`.",
      off: "You're out of this server's Monday recap.",
      statusOn: "You're in this server's Monday recap.",
      statusOff: "You're not in this server's Monday recap. Join with `/den recap on:true`.",
      serverOff:
        "(This server hasn't turned the recap on yet: a server admin can, with `/den setup recap:true`.)",
    },
    nudges: {
      off: "Nudges off: the bot won't message you about tilt or stop-loss.",
      dm: "Nudges by DM: when you hit a stop-loss you set (and, with Plus, a losing streak your history says hurts), the bot DMs you. Your notification settings on the site still decide: {url}",
      server:
        "Nudges in {channel}: your stop-loss (and Plus tilt) reminders go there, with your name. Your notification settings on the site still decide: {url}",
      serverOff:
        "This server doesn't take nudges. A server admin can turn them on with `/den setup nudges:true`, or use `/den nudges where:dm`.",
      statusOff:
        "Nudges are off. Turn them on with `/den nudges where:dm` (or `where:server` in a server that takes them).",
      statusDm: "Nudges come by DM. Settings: {url}",
      statusServer: "Nudges go to a server channel. Settings: {url}",
      unavailable: "Nudges aren't set up on Dota Den yet.",
    },
    setup: {
      notAdmin: "Only people with Manage Server can set the bot up here.",
      unavailable: "The bot can't post to channels yet (Dota Den's side isn't set up).",
      recapPlus: "The Monday server recap is a Dota Den Plus feature of whoever turns it on: {url}",
      noChannel: "Pick a channel with `/den setup channel:`.",
      cantPost:
        "I can't post in {channel}. Give the Dota Den bot View Channel, Send Messages and Embed Links there, then try again.",
      hello:
        "Dota Den will post here: the Monday recap of members who turn it on (`/den recap on:true`) and nudges members ask for. {url}",
      saved:
        "Saved. Channel: {channel} · Monday recap: {recap} · Nudges: {nudges} · Language: {language}",
      yes: "on",
      no: "off",
    },
    weekly: {
      title: "Weekly recap · {from} to {to}",
      summary: "{players} played {games}: {record}.",
      players: { one: "1 member", other: "{n} members" },
      games: { one: "1 ranked game", other: "{n} ranked games" },
      hero: "Most played: {hero}, {games} ({record})",
      footer:
        "Ranked games, Monday to Sunday (Manila time), of members who joined with /den recap.",
    },
  },
  link: {
    title: "Discord account",
    description:
      "Link your Discord account so the Dota Den bot knows it's you: `/den me` and this server's weekly leaderboard. We only learn your Discord name and id.",
    connect: "Connect Discord",
    linkedAs: "Linked as {name}",
    unlink: "Unlink",
    unlinking: "Unlinking…",
    off: "Connecting Discord isn't set up yet.",
    outcomes: {
      linked: "Discord linked.",
      denied: "Discord didn't confirm the link. Try again.",
      bad_state: "That link expired. Try again.",
      off: "Connecting Discord isn't set up yet.",
    },
    failed: "Couldn't unlink. Try again.",
    invite: "Add the bot to your server",
    commands:
      "In Discord: `/den me`, `/den leaderboard` and `/den recap` are free; `/den coach`, `/den ask` and `/den pick` come with Plus. A server admin turns on the Monday recap with `/den setup`.",
    nudgesLabel: "Tilt and stop-loss nudges on Discord",
    nudgesOff: "Off",
    nudgesDm: "Direct message",
    nudgesServer: "In a server channel (set with /den nudges)",
    nudgesHelp:
      "Sent when a game reaches a stop-loss you set (and, with Plus, after a losing streak your own history says hurts). Your notification settings above still decide. To get them in a server channel instead, use `/den nudges where:server` there.",
    nudgesSaved: "Saved.",
    nudgesFailed: "Couldn't save that. Try again.",
  },
  card: {
    title: "Discord",
    description:
      "Post your finished matches to a Discord channel, so your group sees how your games went: win or loss, hero, K/D/A and a link to the match. Only games you play after you set this up are posted, each once.",
    howTo:
      "In Discord, open the channel's settings → Integrations → Webhooks → New Webhook, then Copy Webhook URL and paste it here.",
    urlLabel: "Webhook URL",
    urlPlaceholder: "https://discord.com/api/webhooks/…",
    secretNote:
      "Treat this URL like a password: anyone who has it can post to the channel. Dota Den never shows it again.",
    save: "Save webhook",
    saving: "Checking with Discord…",
    saved: "Webhook saved. Your next matches will be posted.",
    saveFailed: "Couldn't save that webhook.",
    invalid:
      "That isn't a Discord webhook URL. It should look like https://discord.com/api/webhooks/…",
    postingTo: "Posting to {name}",
    unnamed: "your Discord webhook",
    toggle: "Post my finished matches",
    toggleHelp: "Turning this back on only posts games you play from then on.",
    turnedOn: "Your matches will be posted to Discord.",
    turnedOff: "Discord posts are off.",
    test: "Send a test post",
    testSent: "Test post sent. Check the channel.",
    testFailed: "Couldn't send a test post.",
    remove: "Remove webhook",
    removed: "Webhook removed.",
    removeFailed: "Couldn't remove the webhook. Try again.",
    replace: "Use a different webhook",
    cancel: "Cancel",
    gone: "Discord says this webhook was deleted, so posting stopped. Paste a new webhook URL to start again.",
    lastPosted: "Last post: {date}",
    saveToggleFailed: "Couldn't save that. Try again.",
  },
  post: {
    title: "{result} · {hero}",
    win: "Win",
    loss: "Loss",
    kda: "K / D / A",
    duration: "Duration",
    mode: "Mode",
    queue: "Queue",
    ranked: "Ranked",
    unranked: "Unranked",
    unknownMode: "Unknown mode",
    solo: "Solo",
    party: "Party",
    partyOf: "Party of {n}",
    unknownQueue: "Unknown",
    heroFallback: "Hero #{id}",
    footer: "Dota Den · Match {id}",
    test: {
      title: "Dota Den is connected",
      description:
        "Finished matches will show up here: win or loss, hero, K/D/A and a link to the match.",
    },
  },
};
