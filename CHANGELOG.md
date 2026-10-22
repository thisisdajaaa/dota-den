# Changelog

Every production release, newest first, from the release merges into `main`. Each release went
through staging (CI: lint, typecheck, unit, integration and E2E tests) first. Planned work is in
[docs/roadmap.md](docs/roadmap.md).

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
