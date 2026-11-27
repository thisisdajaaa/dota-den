/**
 * Dota Den Plus: pricing page, plan card, badge, admin counts and the legal pages (ADR 0013).
 *
 * DRAFT (legal): the `terms` and `refunds` texts below are plain-language drafts for the owner
 * to review before Plus goes on sale. They are not legal advice. Check them against the payment
 * provider's own buyer terms and refund policy. The contact section under them comes from
 * SUPPORT_EMAIL (common.legal.contact).
 */
export const plus = {
  badge: {
    label: "Plus",
    title: "Dota Den Plus supporter",
  },
  page: {
    title: "Dota Den Plus",
    kicker: "Support Dota Den",
    lead: "Everything that's free today stays free. Plus is a way to keep Dota Den running, with a few extras for the players who chip in.",
    staffTitle: "You have Plus",
    staffBody: "You're an admin, so every Plus feature is on for you without a subscription.",
    comingSoonTitle: "Plus is coming soon",
    comingSoonBody:
      "We're getting payments ready. Nothing is for sale yet, and nothing you use today will be locked behind it.",
    pausedTitle: "New subscriptions are paused",
    pausedBody:
      "You can't start Plus right now. If you already subscribe, you can still manage or cancel it from your account page.",
    freeTitle: "Free for everyone, always",
    free: {
      matches: "Match history, sessions, heroes and your reports",
      mmr: "MMR journal and rank journey",
      draft: "Draft practice, AI captain, challenges and rooms",
      community: "Groups, together stats, tracked players and leaderboards",
      live: "Live games, streams and followed streamers",
      notifications: "Session, weekly and patch notifications",
      coach: "AI match coach: one new review of your own parsed match per week",
    },
    plusTitle: "What Plus adds",
    perks: {
      coach: {
        title: "Unlimited AI coach",
        body: "A coach review of any of your parsed matches, as often as you like (free: one new review a week). It's written from that match's numbers only, and it can be wrong. Your newest ranked games are also reviewed automatically after each sync, with a notification when the review is ready.",
        where: "Matches → open one of your games → AI coach → “Write my review”.",
      },
      ask: {
        title: "Ask Den: {plus} questions a day",
        body: "Ask about your games, heroes, builds and the patch, answered from your own data and ours ({free} a day free).",
        where:
          "The gold chat button at the bottom right of any page, or Ask Den in the menu. Ask anything about your games, heroes or the meta.",
      },
      compare: {
        title: "How you compare, on every hero",
        body: "Your last hits, kills + assists and deaths on each of your heroes against players at your rank (or the rank above), at the same game length, with your biggest gap to work on (free: your most played hero).",
        where: "Heroes → How you compare. Pick any hero you play to see your biggest gap.",
      },
      coaching: {
        title: "Faster hero coaching",
        body: "Item timings and lane results for your whole recent history on every hero: up to 100 of your parsed games are read each day (free: 10 a day).",
        where: "Heroes → open one of your heroes → the Coaching sections (item timings and lanes).",
      },
      buildCheck: {
        title: "Build check vs high-rank",
        body: "On each hero page, your item timings against Legend–Immortal players at your position last week, with one thing to try (free: your own timings).",
        where: "Heroes → open one of your heroes → Build check vs high-rank.",
      },
      splits: {
        title: "Your splits",
        body: "Your whole history by patch, position, time of day, game length, lane result, lane partners and opponents, and gold at 20 minutes (throws and comebacks), each against your average (free: your heroes, lanes and matchups).",
        where: "Heroes → Your splits.",
      },
      postMortem: {
        title: "Draft post-mortem",
        body: "On ranked match pages, how the draft played out: lanes at 10 minutes against what the draft expected, where the gold lead was won, and the counters it liked (free: the draft read).",
        where: "Matches → open a ranked game → the Draft post-mortem section, below the draft.",
      },
      read: {
        title: "AI read of your battle report",
        body: "Pick any period on your battle report and get a few observations about it and one thing to focus on, written from that page's numbers only (each lists the numbers it uses).",
        where: "Battle report → pick a period → “What this period says” → “Write my read”.",
      },
      pick: {
        title: "Pick for me: your top five",
        body: "During a real ranked draft, add the enemy picks and see your five best heroes against them, with your record and each matchup (free: the best one).",
        where:
          "Draft → Pick for me. During your real ranked draft, add the enemy picks as they lock in.",
      },
      session: {
        title: "Session companion",
        body: "While you play, a notification after each game with the result, your record this session and, when your own history shows you lose more after a losing streak, a heads-up to take a break.",
        where:
          "Account → Notifications: turn notifications on, then keep “Live session updates” on. Works while Steam shows you in Dota.",
      },
      sync: {
        title: "Priority sync",
        body: "A long match history imports faster: shorter waits and bigger chunks between imports, and your newest unparsed games are sent to OpenDota for parsing (up to 3 per sync). It shares the same OpenDota budget as everyone, so free players aren't slowed down.",
        where: "Nothing to do: it's automatic when your games sync on the Overview.",
      },
      alerts: {
        title: "Go-live alerts",
        body: "A notification within a few minutes when a streamer you follow on /live starts streaming. Once per stream, and you can turn it off.",
        where: "Live → follow a channel, and turn on notifications in Account → Notifications.",
      },
      badge: {
        title: "Supporter badge",
        body: "A small Plus badge next to your name in the app and on leaderboards.",
        where: "Automatic: next to your name in the menu and on leaderboards.",
      },
      limits: {
        title: "Room for more",
        body: "Track up to {players} players, follow {streamers} channels and be in {groups} groups (double the free limits).",
        where: "Players → track players; Live → follow channels; Groups → create or join.",
      },
      thanks: {
        title: "Keep it independent",
        body: "Servers, data and AI calls cost money every month. Plus pays for them, without ads.",
        where: "Nothing to do. Thank you!",
      },
    },
    monthly: "Monthly",
    yearly: "Yearly",
    perMonth: "per month",
    plansTitle: "Plans",
    opensSoon: "Opens soon",
    perYear: "per year",
    yearlySaving: "2 months free compared with paying monthly",
    subscribe: "Get Plus",
    subscribeMonthly: "Get Plus monthly",
    subscribeYearly: "Get Plus yearly",
    signIn: "Sign in with Steam to get Plus",
    youHavePlus: "You have Plus. Thank you!",
    stillBilling:
      "You still have a Plus subscription: a payment didn't go through, or it's paused. Update your card or resume it from your account page instead of starting a new one, so you're never charged twice.",
    manage: "Manage your plan",
    notes: {
      currency:
        "Prices are in Philippine pesos. The checkout may show them in your local currency, with sales tax or VAT added where it applies.",
      provider:
        "Payments are handled by our payment provider, acting as merchant of record. They take the payment, charge any tax and send your receipt. Dota Den never sees your card.",
      providerPolar:
        "Payments are handled by Polar (polar.sh), acting as merchant of record. Polar takes the payment, charges any tax and sends your receipt. Dota Den never sees your card.",
      currencyPolar:
        "Prices are in Philippine pesos. The checkout shows any sales tax or VAT that applies where you live before you pay.",
      cancel:
        "Cancel anytime in the billing portal. You keep Plus until the end of the period you paid for.",
    },
    faqTitle: "Questions",
    faq: {
      freeQ: "Will anything that's free become paid?",
      freeA:
        "No. Plus only adds things. If a free feature ever has to change, it won't be to push you into paying.",
      cancelQ: "What happens when I cancel?",
      cancelA:
        "Nothing changes until the end of the month or year you paid for. Then your account goes back to free, and your data stays.",
      failQ: "What if a payment fails?",
      failA:
        "You keep Plus for 7 days while the payment provider retries your card. Update your card in the billing portal to keep it.",
      limitsQ: "What happens to my extra follows if Plus ends?",
      limitsA:
        "Nothing is deleted. You just can't add more until you're under the free limit again.",
    },
    legal: "Read the {terms}, the {refunds} and the {privacy}.",
    termsLink: "terms",
    refundsLink: "refund policy",
    privacyLink: "privacy policy",
    trial: {
      title: "Try Plus free for 7 days",
      body: "No card needed. Nothing is charged, and it ends by itself after 7 days. One trial per Steam account.",
      start: "Start free trial",
      signIn: "Sign in to start a free trial",
      activeTitle: "Your free trial is on",
      activeBody:
        "You have Plus until {date}. Nothing is charged and it ends by itself. Subscribe below to keep Plus after that.",
      error: {
        used: "Your account has already had Plus or a free trial.",
        unavailable: "The free trial isn't available right now.",
        tooMany: "Too many tries. Wait a minute and try again.",
        signIn: "Sign in again to start the trial.",
        network: "Couldn't reach Dota Den. Check your connection and try again.",
        down: "Something went wrong. Try again in a moment.",
      },
    },
    invite: {
      title: "Invite a friend: you both get a week of Plus",
      body: "Send your link to a friend who's new to Dota Den. Once 10 of their games are imported, you each get 7 days of Plus. No card, nothing charged.",
      cta: "Get your invite link",
      signIn: "Sign in to get your invite link",
    },
    checkoutError: {
      network: "Couldn't reach Dota Den. Check your connection and try again.",
      hasPlus:
        "You already have Plus, or a subscription that's still billing. Manage it from your account page.",
      unavailable: "Plus can't be bought here right now.",
      tooMany: "Too many tries. Wait a minute and try again.",
      signIn: "Your session ended. Sign in again to get Plus.",
      down: "The checkout isn't available right now. Nothing was charged; try again in a few minutes.",
    },
  },
  invite: {
    title: "Invite a friend",
    lead: "Send your link to a friend who hasn't used Dota Den yet. When they sign in with Steam and their games are imported, you both get a week of Plus.",
    linkLabel: "Your invite link",
    copy: "Copy link",
    copied: "Copied",
    share: "Share",
    shareText:
      "Track your Dota games with me on Dota Den. Sign in with this link and we both get a week of Plus free:",
    joined: "Friends who joined",
    waiting: "Waiting for their games",
    earned: "Weeks you earned",
    earnedOf: "{earned} of {max}",
    rulesTitle: "How it works",
    rules: {
      link: "Your friend opens your link and signs in with Steam within 7 days of first using Dota Den.",
      games:
        "Once 10 of their games are imported, you each get 7 days of Plus. That usually takes a few minutes after they sign in.",
      free: "Nothing is charged and nothing renews. If you already have free Plus running, the new week starts when it ends.",
      paid: "If you pay for Plus, your week runs at the same time as your subscription. Your bill doesn't change.",
      max: "You can earn up to {max} weeks. Your friends always get theirs.",
      once: "Each Steam account can use one invite, and only before it has had a Plus subscription.",
    },
    unavailable: "Invites are off right now. They come back when Plus is on sale.",
    maxed: "You've earned all {max} weeks. Friends you invite still get theirs.",
    mine: {
      pending:
        "You used a friend's invite. Your week starts once 10 of your games are imported: open your dashboard to import them.",
      rewarded: "You joined through a friend's invite and got your week of Plus.",
      expired: "The invite you used lapsed: your games didn't show up within 30 days.",
    },
  },
  referral: {
    title: "A friend invited you to Dota Den",
    metaDescription:
      "Sign in with Steam through this invite: once your games are imported, you and your friend each get a week of Dota Den Plus.",
    lead: "Dota Den tracks your Dota 2 games, MMR and heroes for free. Sign in with Steam through this invite and you and your friend each get a week of Plus once your games are imported.",
    fine: "No card needed. Nothing is charged, and the week ends by itself.",
    signIn: "Sign in with Steam",
    claim: "Claim your week of Plus",
    claiming: "Claiming…",
    check: "Check again",
    rewarded: "Done: you both have a week of Plus. Nothing is charged; it ends by itself.",
    waiting:
      "Claimed. Your week starts once 10 of your games are imported. Open your dashboard to import them; it usually takes a few minutes.",
    expired: "This invite lapsed: your games didn't show up within 30 days.",
    own: "This is your own invite link. Send it to a friend.",
    notFoundTitle: "This invite link doesn't work",
    notFoundBody: "Check the link with your friend. Dota Den is free to use either way.",
    unavailable: "Invites are off right now. Dota Den is free to use either way.",
    toDashboard: "Go to your dashboard",
    seePlus: "See what Plus adds",
    getYours: "Get your own invite link",
    error: {
      own_code: "This is your own invite link. Send it to a friend.",
      not_new:
        "Invites are for players new to Dota Den. You can still try Plus free for 7 days on the Plus page.",
      already_referred: "This Steam account has already used an invite.",
      had_plus: "Invites are for players who haven't had a Plus subscription.",
      unavailable: "Invites are off right now.",
      unknown_code: "This invite link doesn't work.",
      tooMany: "Too many tries. Wait a minute and try again.",
      signIn: "Sign in again to claim the invite.",
      network: "Couldn't reach Dota Den. Check your connection and try again.",
      down: "Something went wrong. Try again in a moment.",
    },
  },
  card: {
    title: "Your plan",
    free: "Free",
    freeBody: "You're on the free plan: every feature that's free stays free.",
    plusName: "Dota Den Plus",
    see: "See what Plus adds",
    manage: "Manage or cancel",
    manageHint: "Opens the billing portal of our payment provider.",
    renews: "Renews on {date}",
    trial: "Trial",
    staff: "Plus is on the house: you're an admin.",
    cancelled: "Cancelled. You keep Plus until {date}.",
    grace: "Your last payment failed. Update your card by {date} to keep Plus.",
    ended: "Your Plus subscription has ended.",
    paused: "Your Plus subscription is paused.",
    disabled:
      "Plus features are switched off on Dota Den right now. Your subscription isn't affected.",
    alertsOn: "Go-live alerts are on in Notifications below.",
    freeTrial: "Free trial: Plus until {date}. Nothing is charged; it ends by itself.",
    referral: "Invite reward: Plus until {date}. Nothing is charged; it ends by itself.",
    invite: "Invite a friend",
    status: {
      on_trial: "Trial",
      active: "Active",
      paused: "Paused",
      past_due: "Payment failed",
      unpaid: "Unpaid",
      cancelled: "Cancelled",
      expired: "Ended",
    },
    plan: {
      monthly: "Monthly",
      yearly: "Yearly",
    },
  },
  deleteWarning:
    "You have a Plus subscription that's still billing. Deleting your account doesn't cancel it: cancel in the billing portal first. Payment records stay with our payment provider.",
  deleteNote:
    "Your Plus subscription record is deleted with your account. Payment records are kept by our payment provider, not by Dota Den.",
  admin: {
    title: "Plus subscriptions",
    off: "Plus isn't configured on this server.",
    disabled:
      "Configured, but switched off (PLUS_ENABLED isn't true): everyone is treated as free.",
    trials: "Free trials",
    trialsDetail: "{active} running · {started} started · {subscribed} subscribed after",
    referrals: "Invites",
    referralsDetail: "{rewarded} rewarded · {pending} waiting for games · {claimed} claimed",
    entitled: "Players with Plus",
    unlinked: "Unlinked",
    unlinkedDetail: "Paid but not tied to a user",
    none: "No subscriptions yet.",
    caption: "Subscriptions by status",
    status: "Status",
    count: "Subscriptions",
  },
  terms: {
    title: "Terms of use",
    kicker: "Legal",
    updated: "Last updated {date}",
    sections: {
      about: {
        title: "About Dota Den",
        body: "Dota Den is independent software that helps Dota 2 players review their own games: match history, rank tracking, draft tools and AI coaching, built and run by its own developer. It isn't affiliated with or endorsed by Valve Corporation. Dota 2 is a registered trademark of Valve Corporation.",
      },
      account: {
        title: "Your account",
        body: "You sign in with Steam. Keep your Steam account secure: what happens under your account is your responsibility. We may suspend accounts that abuse the service, for example by attacking it or scraping it.",
      },
      data: {
        title: "Match data",
        body: "Match data comes from public sources such as OpenDota and Valve. We show it as we get it and can't promise it's complete or correct. Nothing on Dota Den guarantees results in your games.",
      },
      free: {
        title: "Free and Plus",
        body: "The core of Dota Den is free. Plus is an optional subscription that adds extras; free features don't become paid because Plus exists.",
      },
      payments: {
        title: "Payments",
        body: "Plus is sold by our payment provider, acting as merchant of record. They process the payment, charge any sales tax or VAT and issue receipts, and their buyer terms apply to the purchase.",
        polar:
          "Plus is sold by Polar (polar.sh), acting as merchant of record. Polar processes the payment, charges any sales tax or VAT and issues receipts, and Polar's buyer terms apply to the purchase.",
      },
      billing: {
        title: "Renewal and cancelling",
        body: "Plus renews every month or year until you cancel. Cancel anytime in the billing portal; you keep Plus until the end of the period you paid for. New players can try Plus free for 7 days, once per Steam account: no card is needed, nothing is charged and it ends by itself.",
      },
      changes: {
        title: "Changes",
        body: "Features may change over time. If we take something away from Plus, we'll say so in advance and you can cancel. We'll update these terms when they change and show the date above.",
      },
      warranty: {
        title: "No warranty",
        body: "Dota Den is provided as is, without warranties, as far as the law allows. Nothing in these terms limits rights you have under the consumer law where you live.",
      },
    },
  },
  refunds: {
    title: "Refund policy",
    kicker: "Legal",
    updated: "Last updated {date}",
    sections: {
      who: {
        title: "Who handles refunds",
        body: "Plus is sold through our payment provider, acting as merchant of record. Refunds are issued by them, following their refund policy and the consumer law where you live.",
        polar:
          "Plus is sold through Polar (polar.sh), acting as merchant of record. Refunds are paid out by Polar: we decide on refund requests under this policy, and Polar may also refund a payment on its own within 60 days of purchase, for example to prevent a chargeback. The consumer law where you live applies too.",
      },
      cancel: {
        title: "Cancelling",
        body: "Cancelling stops future renewals. You keep Plus until the end of the period you already paid for; it isn't refunded automatically.",
      },
      request: {
        title: "Asking for a refund",
        body: "If something went wrong (for example, you were charged twice, or Plus didn't work for you), ask within 14 days of the charge through the billing portal or by replying to your payment receipt.",
        polar:
          "If something went wrong (for example, you were charged twice, or Plus didn't work for you), ask within 14 days of the charge using the contact details below. Your receipts and subscription are in Polar's customer portal, linked from the {account}.",
      },
      after: {
        title: "After a refund",
        body: "When a payment is refunded in full, Plus may end straight away. Your Dota Den data isn't affected.",
      },
      rights: {
        title: "Your rights",
        body: "Nothing in this policy limits rights you have under the consumer law where you live.",
      },
    },
  },
};
