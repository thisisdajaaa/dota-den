/**
 * Dota Den Plus: pricing page, plan card, badge, admin counts and the legal pages (ADR 0013).
 *
 * DRAFT (legal): the `terms` and `refunds` texts below are plain-language drafts for the owner
 * to review before Plus goes on sale. They are not legal advice. Check them against Lemon
 * Squeezy's own buyer terms and refund policy. The contact section under them comes from
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
      },
      sync: {
        title: "Priority sync",
        body: "A long match history imports faster: shorter waits and bigger chunks between imports, and your newest unparsed games are sent to OpenDota for parsing (up to 3 per sync). It shares the same OpenDota budget as everyone, so free players aren't slowed down.",
      },
      alerts: {
        title: "Go-live alerts",
        body: "A notification within a few minutes when a streamer you follow on /live starts streaming. Once per stream, and you can turn it off.",
      },
      badge: {
        title: "Supporter badge",
        body: "A small Plus badge next to your name in the app and on leaderboards.",
      },
      limits: {
        title: "Room for more",
        body: "Track up to {players} players, follow {streamers} channels and be in {groups} groups (double the free limits).",
      },
      thanks: {
        title: "Keep it independent",
        body: "Servers, data and AI calls cost money every month. Plus pays for them, without ads.",
      },
    },
    monthly: "Monthly",
    yearly: "Yearly",
    perMonth: "per month",
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
        "Payments are handled by Lemon Squeezy, our merchant of record. They take the payment, charge any tax and send your receipt. Dota Den never sees your card.",
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
    cancelled: "Cancelled. You keep Plus until {date}.",
    grace: "Your last payment failed. Update your card by {date} to keep Plus.",
    ended: "Your Plus subscription has ended.",
    paused: "Your Plus subscription is paused.",
    disabled:
      "Plus features are switched off on Dota Den right now. Your subscription isn't affected.",
    alertsOn: "Go-live alerts are on in Notifications below.",
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
        body: "Dota Den is an unofficial fan project for Dota 2 players. It isn't affiliated with or endorsed by Valve Corporation. Dota 2 is a registered trademark of Valve Corporation.",
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
        body: "Plus is sold by Lemon Squeezy, acting as merchant of record. They process the payment, charge any sales tax or VAT and issue receipts, and their buyer terms apply to the purchase.",
      },
      billing: {
        title: "Renewal and cancelling",
        body: "Plus renews every month or year until you cancel. Cancel anytime in the billing portal; you keep Plus until the end of the period you paid for.",
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
        body: "Plus is sold through Lemon Squeezy, our merchant of record. Refunds are issued by them, following their refund policy and the consumer law where you live.",
      },
      cancel: {
        title: "Cancelling",
        body: "Cancelling stops future renewals. You keep Plus until the end of the period you already paid for; it isn't refunded automatically.",
      },
      request: {
        title: "Asking for a refund",
        body: "If something went wrong (for example, you were charged twice, or Plus didn't work for you), ask within 14 days of the charge through the billing portal or by replying to your Lemon Squeezy receipt.",
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
