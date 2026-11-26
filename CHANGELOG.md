# Changelog

Every production release, newest first, from the release merges into `main`. Each release went
through staging (CI: lint, typecheck, unit, integration and E2E tests) first. Planned work is in
[docs/roadmap.md](docs/roadmap.md).

## 2026-11-26

- Fuller layouts: hero pages, the battle report, Your splits and the dashboard's Stats tab lay their cards in two balanced columns (no long empty column beside a few cards, no stretched half-empty cards); hero guide item builds use two columns; a short hero list spans the page with the advice below
- Invite a friend (/invite): share your link; when a friend new to Dota Den signs in with Steam through it and 10 of their games are imported, you each get 7 days of Plus. No card, nothing charged, nothing renews; up to 5 weeks per player, and the friend always gets theirs

## 2026-11-25

- When OpenDota is down, pages say so (data may be a saved copy and new games may be slow to show), and every server stops calling it at once instead of each one waiting on timeouts
- Hero guide links get their own preview image; player, Meta and patch links show what's on the page
- Admin: today's OpenDota, STRATZ and AI budgets, where players drop off between sign-in and subscribing, and alerts when a budget passes 80% or Redis fails

## 2026-11-24

- Your year in Dota (/report/year, free): games, win rate, time in games, top and best heroes, longest streaks, busiest day, months, weekdays and the hours you play, and your best win, counted from your imported games in your time zone; earlier years too. Share it as a card in English, Filipino or Bisaya, and from December 1 to January 15 the overview links to it
- Ask Den from any page: a chat button in the lower right (above the tab bar on phones) opens the chat in a panel, full screen on phones; your chat stays open while you move between pages, and "Open full page" goes to /ask
- Player and guide pages load for signed-out visitors more often: the daily OpenDota allowance went from 3,000 to 15,000 calls now that Dota Den uses a paid OpenDota key

## 2026-11-23

- Plus: try it free for 7 days, no card needed and nothing charged; one trial per Steam account, it ends by itself, and a notification reminds you the day before
- Overview: four tabs (Overview, Stats, Friends, Goals) instead of one long page; links keep the tab you were on
- Account: a section index (sticky chips on phones, a side list on wide screens) to jump to plan, stop-loss, notifications, email, Discord, shares and your data
- Live: two streams side by side on phones; Together: groups sit under your friends list; the draft record card stays three across on phones
- Admin: totals line up on wide screens, the usage table is sorted by use, and the Plus box counts trials (running, started, subscribed after)
- Fix: Ask Den failed on some patch questions ("which version?") when the AI left the version empty
- Fix: when the "friends in game" lookup fails, the log now says why

## 2026-11-22

- Sidebar, hero page header, Plus page (AI perks first) and the overview's first steps tidied up

## 2026-11-20

- Plus: your splits (/heroes/splits): win rate and games by patch, position, time of day, lane partner and game length
- Plus: draft post-mortem on match pages: lanes at 10 minutes against the draft, where the gold lead was won, and which counters it liked
- Guides: late-game items, the 7.42 map with zoom, current skills and talents, an affordable starting build, and the 7.42 ward map
- Fix: long Ask Den chats no longer stretch the page below the footer

## 2026-11-19

- Ask Den, the AI chat (/ask): ask about your games, heroes, builds, wards and the meta in English, Filipino or Bisaya; answers come only from your data and our stats, with numbers and names checked. Free: 5 questions a day; Plus: 100. Several chats per player, kept 30 days; the chat scrolls inside a screen-sized panel
- Plus: Monday AI weekly coach: a note on the battle report and a push every Monday at 07:00 Manila time
- Plus: faster hero coaching (up to 100 parsed games read a day; free stays at 10) and a build check against Legend–Immortal item timings on hero pages
- Discord bot: `/den coach`, `/den ask` and `/den pick` for Plus, a server recap, and stop-loss and tilt nudges (on once the Discord app is set up)
- Stack planner on group pages: tick who's in tonight for a lineup from everyone's last 30 days (free); Plus adds hero options and posting to Discord
- Plus price: ₱149 a month or ₱1,490 a year
- Dark, slim scrollbars everywhere
- Fix: failed match backfills and the patch-notes job (job ids QStash refused); hero coaching's daily cap could be passed when two runs overlapped

## 2026-11-18

- Plus is on sale, with payments through Polar (merchant of record); checkout needs you signed in
- Share cards in English, Filipino and Bisaya: win streak, session recap, standout game, weekly recap and rank journey, as link previews and square posts, with copy link, download and Facebook share
- Guides: in-game style build path with item timings, skill build, talents and ward spots (support guides and /guides/wards)
- Meta for your bracket: pick Herald–Guardian up to Divine–Immortal; defaults to your own bracket when signed in (free)
- Stop-loss: set your own limits (losses, losses in a row, games per session); the overview shows where you are and a push reminds you once per limit (free)
- Faster first import, and a clear fix when your match data is private
- Security update to Next.js 16.4.6
- Fix: `robots.txt` named localhost instead of dota-den.com

## 2026-10-27

- Plus page shows the monthly and yearly prices before Plus is on sale (with an "Opens soon" button), and the footer always links to it
- Terms, refunds and privacy: Dota Den is described as independent software, and payments as "our payment provider" (merchant of record) instead of naming Lemon Squeezy, which declined the store
- Fix: every AI feature (coach, auto-reviews, battle report read, AI draft captain) failed in production since 2026-10-15: the AI provider (Groq) refuses requests from Hong Kong, where functions ran. Functions now run in Singapore (`sin1`); the database stays in Hong Kong

## 2026-10-26

- How you compare: Divine and Immortal players (the top bracket) no longer see a "rank above" option that showed the same numbers
- Battle report AI read: when the AI service itself fails, it says so instead of blaming your numbers; the provider's reason is logged
- Admin: "Set up job schedules" creates the 5-minute QStash schedules (go-live alerts, session companion) from the server, without handling the QStash token locally
- Overview: the queue card no longer stretches into an empty block; recent form sits under it, and a new "Where you stand" card beside your heroes shows your biggest gap and edge against your rank (How you compare); recent matches shows 8 games
- How you compare: when OpenDota is down, your imported games are compared instead (kills + assists and deaths; last hits need OpenDota), and the message says which source failed
- Plus: admins have Plus without a subscription (no supporter badge, not counted as paying)
- Admin: "What gets used": uses and players per paid or AI feature (last 7 and 30 days), and the share of recent ranked games with a parsed replay
- How you compare (Heroes): your last hits, kills + assists and deaths on each hero against players at your rank or the rank above, at the same game length (STRATZ), with your biggest gap to work on; Plus compares every hero you play
- Plus: session companion: while Steam shows you in Dota, your new games are checked every few minutes and each one gets a notification with the result and your record this session; after a losing streak, a heads-up when your own history shows you win less after streaks like it (switch it off in notification settings)

## 2026-10-25

- Discord (switched on once the Discord app is set up): link your Discord on the account page, and the Dota Den bot answers `/den me` (your week, form and heroes) and `/den leaderboard` (your server's ranked wins this week)
- Plus: AI read of your battle report for any period: a few observations and one focus, written from that page's numbers only and checked against them
- Pick for me (ranked draft helper): add the enemy picks during a real ranked draft and your own heroes are ranked by your record and how they do against those picks (and with your team) in high-rank games; Plus shows the top five
- Plus: automatic AI review of your newest ranked games after each sync, written once the replay is parsed, with a notification (switch it off in notification settings)
- Security: Steam sign-in refuses callbacks that repeat a field (they could be used to sign in as another player), and return paths that only point elsewhere once resolved are refused

## 2026-10-24

- Fixes from a full audit:
  - MMR journal: an empty MMR field (or an empty screenshot read) can no longer save an MMR of 0
  - Hero pages read your whole history, not just your newest 5,000 games
  - Matches parsed after import are recognised as parsed (coaching extras and Plus parse requests)
  - Draft rooms catch up every turn that timed out while nobody was looking; a lagging client resyncs instead of "not your turn"
  - The draft outlook shows no estimate (instead of 50%) when no hero data is available
  - Watch live: "Storm Spirit mid" no longer links to Team Spirit's game
  - Weekly goals: a win rate shown as 60% meets a 60% goal; hero goals say they count ranked games
  - The AI coach labels party play by the app's one rule (non-matchmaking lobbies are unknown)
  - Removing a group member gives the group a new invite link
  - Meta page: STRATZ is asked at most every 5 minutes while it's failing
  - Dependencies: fast-uri 3.1.9 (moderate advisory)
- Hero guides: item builds from STRATZ's high-rank pubs for each position the hero is played in (tabs), with the typical purchase minute and the win rate of games that bought each item; pro builds when STRATZ can't answer
- Admin page redesign: health at a glance (jobs, alerts, errors, Plus) linking to each section, one compact metrics bar without repeats, users as cards on phones, operations in a side column
- Plus (before launch): Plus lapses 3 days after a renewal date with no word from Lemon Squeezy (a lost webhook can't mean Plus forever), and the owner gets an alert for every refund
- Plus (before launch): a payment event can no longer be lost when Lemon Squeezy retries during a slow delivery, no second subscription while a renewal is still being retried, and the yearly plan now says "2 months free" (the "37% less" was wrong for peso prices)
- AI coach: the card offers the review as soon as the requested replay parse arrives, without a reload
- AI match coach: reviews no longer fail on "10:00", the game phases or a non-breaking hyphen, and the coach no longer suggests target timings that aren't from your match (30 of 30 test reviews written in English, Filipino and Cebuano)
- Counters from STRATZ: draft captain, challenges, hero guide matchups and pool advice now use the latest full week of Legend–Immortal pub games (about 180,000 games for a popular hero) instead of a few thousand pro games; draft win estimates re-fitted on that data (57.8% accurate on newer games, up from 57.0%)
- Privacy page: what Dota Den stores, who processes it, and how to download or delete it
- Security: zod and ip-address updates
- Meta: heroes placed by the position they are actually played (STRATZ public games, Ancient to Immortal), with win rates at that position; Bounty Hunter is now a support

## 2026-10-23

- Stat tiles line up across every page, compact tables, no layouts cut off on phones or in Filipino, full tab names in the bottom bar
- Plus prices shown in pesos; a test purchase can never grant Plus on production
- AI match coach on your own parsed matches: coaching points that cite your real numbers, in your language (one free review a week; unlimited with Plus)
- Priority sync for Plus: faster history imports and automatic replay parse requests for new games
- Dota Den Plus groundwork (switched off until launch): pricing page, plan card, supporter badge, go-live alerts, higher limits, draft terms and refunds pages
- Security: security headers, a daily cap on AI draft calls, sessions verified before using the member OpenDota budget, rate limits on writes
- Reliability: a friendly error page, background tasks always logged, faster database timeouts
- SEO: sitemap, canonical URLs and link previews
- Loading screens for guides, compare, MMR, account and groups
- Stream languages line up across Twitch and Kick
- Watch live: Twitch and Kick streams in their own sections, so Kick is easy to find
- Live games only lists games someone is streaming on Twitch or Kick
- Meta overview: heroes are placed by where they're actually played (no more mid heroes listed as carries)
- One sign-in button on the "Sign in required" page
- Kick streams on Watch live next to Twitch: in the grid, in search, and to follow
- Security: Next.js 16.4.2 (fixes a critical image-optimizer flaw and a Server Actions DoS)
- Background imports run on their own (QStash) and no longer use the guest share of the OpenDota budget

## 2026-10-22

- Watch live: Dota 2 streams to watch right on /live with chat, streamer search, and following
- Date pickers for the battle report range and MMR entries
- A new home page: a live look at the meta, player lookup without signing in, a fuller patch card
- The meta page shows the strongest heroes per role right away
- A guided first dashboard while your games import, and clear empty states everywhere
- Phones: 44px tap targets, a single Filters button on matches, a shorter dashboard
- Correct counts ("1 win", "1 item"), "Party (2)" everywhere, a grouped sidebar
- "Sign in required" has a sign-in button and brings you back to the page you wanted
- Players, leaderboards, friends and groups read saved profiles: no more waiting on OpenDota per row
- Player, meta and battle report pages show at once and stream each section in
- Battle report falls back to your imported games when OpenDota is down
- Together and group pages check fewer games per visit, in parallel
- Daily jobs stay within their time limit; a patch that keeps failing no longer forces constant re-imports
- Dashboard reads about half as much data per visit
- The sync status no longer shows "Sync paused" after every successful sync
- Match history imports about 5x faster, and a failed page no longer starts the import over
- When OpenDota is down or busy, pages show the last good data instead of going empty
- Live pages refresh every minute and stop in an untouched tab (far fewer OpenDota calls)
- Signed-in pages make one session lookup instead of three
- /patches no longer waits for a patch import; finished draft rooms poll less

## 2026-10-16

- Hero coaching: items you win more with, your item timings and lane results (fixes #29)
- Rank journey: your medal and logged MMR over months, with a medal-only share (fixes #30)
- Owner alerts for failed or missed jobs, OpenDota outages and backups; weekly restore drill (fixes #31)
- Servers moved next to the database (Hong Kong): pages respond in about 0.3 s instead of 0.5 s+
- Hero and rank images resized (~95% smaller): /draft 9.1 MB to 0.9 MB, live pages 4.3 MB to 0.7 MB
- Live game pages show the score at once; Twitch streams load after
- No more layout jumps on the home and match pages

## 2026-10-15

- Who you lose to: matchups from your own games (fixes #25)
- Groups: a page for your stack, invite by link (fixes #26)
- A weekly practice plan that ticks from your games (fixes #27)
- Fewer OpenDota calls: saved player profiles for lists, parallel replay reads (fixes #28)

## 2026-10-14

- Stable preview image URLs; match images in Discord posts (fixes #23)
- Stop the weekly email for addresses that bounce or report spam (fixes #24)

## 2026-10-09

- Discord feed: post your new games to your group's channel (fixes #13)
- Friends playing now on the overview, once a Steam Web API key is set (fixes #12)
- Weekly email digest, opt-in with double confirmation, once an email provider is set (fixes #10)
- Share a session or a week as a link with a preview image (fixes #21)
- A first-visit checklist for new players (fixes #22)
- Admin: who comes back, and how many turned on each reminder (fixes #20)
- Opt-in push notifications: session recap, weekly recap, patch news (fixes #19)
- Next.js 16.4.0 for six security advisories; Steam names stored at sign-in
- E2E: production indexes, one identity per parallel test

## 2026-10-06

- Filipino and Cebuano translations (fixes #9)
- Accessibility checks on every page (fixes #17); E2E specs pass alone (fixes #16)
- Architecture refactor (ADR 0009); module init-order fix
- Battle report, with custom range, period comparison, hero tab, lanes and objectives (fixes #18)
- Grade the drafts of your real matches (fixes #2)
- Download your data, delete your account (fixes #3)
- Patch impact on your heroes (fixes #7), match tags and notes (fixes #6)
- Weekly goals (fixes #4), best stacks (fixes #8)
- Ward and death map (fixes #5)

## 2026-10-05

- Images straight from the CDN (fixes #1)

## 2026-10-03

- Your build vs the pros
- Review fixes, guide matchups, README
- Achievements
- Install Dota Den as an app
- Progress on your hero pages
- Daily sync gives every account its turn

## 2026-10-02

- Laning and item timings on match pages
- Ranked this week for you and your friends
- Tilt check
- Daily job records and admin sync button
- Faster player search
- Draft layout, role-aware suggestions, clearable search
- Weekly recap on the overview

## 2026-10-01

- Lane duos cached across servers
- MMR prompt layout fix
- Sync retries when OpenDota is busy; medal history; read MMR from a screenshot
- Explain switching Steam accounts after sign-out
- Hero pool advisor
- How did I play? on match pages
- Error tracking; nightly encrypted backups
- Smaller pages (fixed-size images)
- MMR journal fixes; guides in the nav
- Draft suggestions retry; daily match sync

## 2026-09-30

- Hero guides
- Watch live games; README screenshots
- MMR climb by hero
- Live league and top public games with a draft read
- Link previews for matches, players and drafts; compact patch card
- Admin users and activity page
- MMR log prompt on the overview
- Patch digest on the overview, compare players, teammates tests
- Redis rate limits, shared cache and OpenDota budget, background jobs, mobile fixes, README and docs, env configuration
- AI draft review, fitted win estimate and report weights, leaderboards with opt-in Everyone board
- Five positions, pro laning, draft report card, role editor, friend room history
- Hero pages, lane and role breakdown, match list fix for narrow columns
- Session recaps, teammates on the overview, Together pages, mobile More menu
- Draft outlook and tournament-aware AI, live draft rooms, meta page, draft challenges, footer fix
- Bundled fonts (no Google Fonts download at build)
- Sortable hero pool
- Grounded AI captain, draft suggestions and log, match ranks, player search and tracking
- Weekly OpenDota refresh and post-refresh rescan
- AI draft opponent, live landing data, match record fix, OpenDota history refresh
- M0 + M1 to production
