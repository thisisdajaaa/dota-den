# Changelog

Every production release, newest first, from the release merges into `main`. Each release went
through staging (CI: lint, typecheck, unit, integration and E2E tests) first. Planned work is in
[docs/roadmap.md](docs/roadmap.md).

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
