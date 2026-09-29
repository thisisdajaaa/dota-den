# Dota Den

An unofficial Dota 2 companion for solo and party progression, patch notes and
Captain's Mode-style draft practice. It is not affiliated with or endorsed by
Valve.

- Product and engineering spec: [docs/spec.pdf](docs/spec.pdf)
- Architecture decisions: [docs/adr/](docs/adr/)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · MongoDB (official
driver) · shadcn/ui + Tailwind 4 · React Hook Form + Zod · Vitest ·
Playwright

## Getting started

Requires Node 22 (`nvm use`) and a MongoDB instance (local `mongod` or Atlas).

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI
npm run db:indexes
npm run dev
```

For local development without a real Steam round-trip, set
`AUTH_TEST_MODE=true` in `.env.local`. Sign-in then uses a fake identity
provider. The app refuses to start with this flag when `NODE_ENV=production`.

## Scripts

| Script                      | What it does                                                   |
| --------------------------- | -------------------------------------------------------------- |
| `npm run dev`               | Start the dev server                                           |
| `npm run build`             | Production build                                               |
| `npm run lint`              | ESLint (zero warnings allowed)                                 |
| `npm run typecheck`         | Generate route types, then `tsc --noEmit`                      |
| `npm run format` / `:check` | Prettier                                                       |
| `npm test`                  | Unit and component tests (Vitest)                              |
| `npm run test:integration`  | Mongo repository tests (`MONGODB_TEST_URI`, default localhost) |
| `npm run test:e2e`          | Playwright, with the fake identity provider                    |
| `npm run check`             | Every gate except build and E2E                                |
| `npm run db:indexes`        | Create or update all Mongo indexes (idempotent)                |

## Layout

```
src/app/                     routes and composition only
src/modules/<context>/       domain · application · infrastructure · ui
src/components/ui/           shadcn components
src/lib/                     env, logger, db client, http helpers
tests/{unit,component,integration,e2e}/
docs/adr/
```

Layer import rules are described in [ADR 0004](docs/adr/0004-module-boundaries.md)
and enforced by `tests/unit/architecture.test.ts`.

## Upgrade policy

Versions are pinned via `package-lock.json`. Upgrade Next and React together,
following the version guide bundled in `node_modules/next/dist/docs/`. Run
`npm run check`, `npm run build` and `npm run test:e2e` before merging.
`jsdom` is held at v26 until the minimum supported Node version is 22.12 or
later (v27 relies on `require(esm)`).

## Milestones

- [x] **M0 foundation:** scaffold, design tokens, CI, Mongo layer, Steam OpenID
      sign-in and sessions, health endpoint, structured logs
- [ ] **M1 MVP**
  - [x] OpenDota adapter, provider gateway, match sync, solo/party/unknown classifier
  - [ ] Dashboard and filters · MMR journal and calendar · patch hub · local draft

## Branches

`main` is for releases and `develop` is for integration. Feature work happens on
`feature/*` branches cut from `develop` and merged back with `--no-ff`.

- [ ] M2 social · M3 intelligence
