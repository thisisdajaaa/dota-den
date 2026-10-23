/**
 * UI copy for the privacy feature: the Account page and the privacy policy (/privacy).
 *
 * DRAFT (legal): `policy` is a plain-language draft for the owner to review; it is not legal
 * advice. It must match what the code stores (see src/modules/privacy/ui/privacy-policy.tsx).
 */
export const privacy = {
  loading: "Loading your account",
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
  policy: {
    title: "Privacy policy",
    kicker: "Legal",
    updated: "Last updated {date}",
    description:
      "What Dota Den keeps about you, which services handle it, how long it's kept and how to download or delete it.",
    sections: {
      summary: {
        title: "The short version",
        body: "Dota Den is an unofficial fan project for Dota 2 players. It isn't affiliated with or endorsed by Valve Corporation. We keep what's needed to show you your games and the tools you choose to use. There are no ads and no analytics or tracking cookies, we don't sell your data, and you can download or delete all of it yourself on the {account}.",
      },
      signIn: {
        title: "Signing in with Steam",
        body: "You sign in on Steam's own page. We never see your Steam password or Steam Guard codes: Steam only tells us your Steam ID, which is public. With it we look up your public Steam name and avatar and your public Dota 2 matches.",
      },
      stored: {
        title: "What we keep when you sign in",
        body: "Everything here is tied to your account and is in your data download:",
        items: {
          account:
            "Your account: your Steam ID, your public Steam name and avatar, your settings (who can see your profile, time zone, language) and the days you opened Dota Den.",
          sessions:
            "Sign-in sessions: a random token, stored only in scrambled (hashed) form. It ends when you sign out, or after about 30 days without a visit.",
          matches:
            "Your matches and stats: public match data imported from OpenDota for your account, parsed replay details when OpenDota has them, and the summaries we work out from them.",
          mmr: "Your MMR journal: the MMR values and notes you log yourself, and your medal history. We never guess your MMR. If you fill one in from a screenshot, the image goes to our AI provider to read the number and isn't stored.",
          notes:
            "What you write: session notes, match tags and notes, weekly goals and practice plans.",
          follows:
            "Players and streamers you follow, and the heroes and items on your patch watchlist.",
          drafts:
            "Drafts: your draft results, challenge attempts and streak, and drafts you played in rooms with friends.",
          groups: "Groups you create or join, with their members.",
          together:
            "Games with friends: the matches you played with other Dota Den players, for the Together page.",
          shares:
            "Share links you create: a snapshot of the session or week you shared, with your Steam name.",
          coach: "AI coach reviews you ask for, and how many you've used (for the free allowance).",
        },
      },
      optional: {
        title: "Only if you turn it on",
        body: "Some features keep more, and only once you switch them on:",
        items: {
          notifications:
            "Notifications: your browser's push address and keys, the browser's name (user agent), the kinds of notifications you chose and a list of what we sent.",
          email:
            "Weekly email: your email address, whether you confirmed it and a list of what we sent. Nothing is sent until you confirm, and every email has an unsubscribe link.",
          discord:
            "Discord feed: the Discord webhook you paste (kept secret: never shown back to the browser or put in your download) and a list of matches we posted.",
          plus: "Dota Den Plus: the plan, status and renewal dates of your subscription as our payment provider reports them, and a record of its billing notices. We never see or store your card details, name or billing address: those stay with Lemon Squeezy.",
        },
      },
      visibility: {
        title: "Who can see what",
        body: "Your profile and MMR are private by default. You're only on the public Everyone leaderboards if you switch it on; your friends see you on the Friends boards. Members of a group see each other's names and the group's stats, and anyone with a share link you made can see what you shared. Your matches themselves are public on OpenDota and Steam whatever you choose here.",
      },
      device: {
        title: "Cookies and storage on your device",
        body: "We only use cookies the site needs to work, none for ads or analytics:",
        items: {
          session:
            "dd_session keeps you signed in (up to 30 days). Scripts on the page can't read it.",
          signIn:
            "dd_oid_state and dd_oid_next protect the Steam sign-in and remember which page to return to (10 minutes).",
          language: "dd_lang remembers your language (1 year).",
          timeZone: "dd_tz remembers your time zone, so days and sessions match yours (1 year).",
          local:
            "Your browser's local storage keeps a few things on your device only: drafts you save on the draft board, challenge progress, collapsed sections and tips you dismissed.",
        },
      },
      services: {
        title: "Services that handle your data",
        body: "These services process data so Dota Den can run. Each only gets what its job needs:",
        items: {
          vercel:
            "Vercel hosts the site and runs our server. Like any web host, it sees your IP address and the pages you request.",
          mongodb: "MongoDB Atlas stores our database.",
          upstash:
            "Upstash (Redis and QStash) holds short-lived request counters, cached public data and background jobs.",
          github: "GitHub stores encrypted nightly backups of the database.",
          opendota:
            "OpenDota provides public match and player data. We ask it for your public matches and profile by your account number, and may ask it to parse a replay of one of your matches.",
          stratz: "STRATZ provides public hero statistics. Nothing about you is sent to it.",
          steam:
            "Steam (Valve) handles sign-in and patch notes, and can tell us which of your Steam friends are in a game right now (if your friends list is public). Avatars load from Steam's image servers.",
          groq: "Groq runs our AI features: the AI draft captain and review, the AI match coach and reading MMR screenshots. It gets the draft, the facts of the match or the screenshot, not your Steam ID or name.",
          lemonSqueezy:
            "Lemon Squeezy sells Plus as merchant of record: it takes the payment, handles tax and receipts, and keeps your billing details under its own privacy policy.",
          resend: "Resend sends the weekly email, if you signed up for it.",
          push: "Your browser's push service (for example Google, Mozilla or Apple) delivers notifications, if you turned them on.",
          discord: "Discord receives the match posts for the webhook you connected, if any.",
          streams:
            "Twitch and Kick: when a page shows a live stream, the player is loaded from their site and can set their own cookies under their own policies. Stream previews and channel pictures load from their servers too.",
        },
      },
      logs: {
        title: "Logs and abuse protection",
        body: "To stop abuse, we count requests per IP address for a minute up to an hour and then drop the count. Error reports keep the page and the error for 30 days, never your cookies, what you typed or your IP address. Our host keeps its own short-lived request logs.",
      },
      retention: {
        title: "How long we keep it",
        body: "We keep your data while you have an account. Some of it ends sooner on its own:",
        items: {
          account: "Your account and what you created: until you delete them or your account.",
          sessions: "Sign-in sessions: about 30 days after your last visit.",
          logs: "Lists of sent notifications, emails and Discord posts, and billing notices: 90 days.",
          caches:
            "Cached public data: friend draft rooms 24 hours after the last move, player profiles 30 days, replay summaries up to a year.",
          backups: "Encrypted backups: 30 days, then they're deleted.",
        },
      },
      control: {
        title: "Download or delete your data",
        body: "On the {account} you can download everything we keep about you (JSON, or CSV for your matches and MMR log), change who can see your profile, and delete your account. Deleting removes your account and everything above straight away. Drafts you played with a friend stay in their history with your name and picture removed, and groups you own pass to their longest-standing member. Backups age out within 30 days. Deleting doesn't cancel a Plus subscription: cancel it in the billing portal first. Your public matches stay on OpenDota.",
      },
      changes: {
        title: "Changes to this policy",
        body: "If we start keeping something new or use a new service, we'll update this page and the date at the top first.",
      },
    },
  },
} as const;
