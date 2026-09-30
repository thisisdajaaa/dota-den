# Architecture

Dota Den is a modular monolith on Next.js 16 (App Router), deployed to Vercel, with MongoDB for storage.

## Modules and layers

Each bounded context lives in `src/modules/<context>/`:

| Layer | Holds | May import |
| --- | --- | --- |
| `domain/` | Pure rules and types (no I/O, no env) | `domain` only |
| `application/` | Use cases (services) and ports (interfaces) | `domain`, own `application` |
| `infrastructure/` | Adapters: MongoDB repositories, OpenDota/Valve/Groq clients | everything in its own module |
| `ui/` | React components | `domain`, `application` types; client components never import server-only code, composition or infrastructure |
| `composition.ts` | Wiring: builds services with their adapters and settings from the env | its own module; other modules' composition |

A module never imports another module's infrastructure. Cross-context reuse goes through that module's
`composition.ts` or `index.ts`. These rules are enforced by `tests/unit/architecture.test.ts`
([ADR 0004](adr/0004-module-boundaries.md)).

Contexts: `identity`, `matches`, `mmr`, `sessions`, `together`, `players`, `heroes`, `meta`, `patches`, `drafts`,
`leaderboards`, plus `shared` (result types, the provider gateway).

Configuration is read only in composition roots and infrastructure (`src/lib/env.ts`), and passed into services and
adapters through constructors, so domain code stays pure and testable.

## Routes

- `src/app/(public)/…`: pages anyone can see (landing, meta, players, patches, draft).
- `src/app/(app)/…`: signed-in pages (dashboard, matches, MMR, sessions, together, heroes, leaderboards).
- `src/app/api/…`: route handlers. See [api.md](api.md).
- `src/proxy.ts` replaces middleware in Next 16. `cookies()`, `headers()` and `params` are async.

## Data flows

### Match sync

1. On the dashboard, the client calls `POST /api/v1/me/matches/sync` (auto-sync; there's also a button).
2. `MatchSyncService` takes a per-account lock and cooldown, then pages through OpenDota's
   `/players/{id}/matches`, storing compact match facts in MongoDB.
3. The first sync backfills the whole public history. If OpenDota has nothing for a player yet, it asks OpenDota to
   refresh (`POST /players/{id}/refresh`, at most every 6 hours while empty, weekly after) and rescans later.
4. Match pages read full match details from OpenDota on demand (cached), not from our database.

### Draft AI

1. The client holds the draft state and sends a compact snapshot. The server replays it through the same rules
   engine, so a tampered board is rejected.
2. `AiOpponentService` loads data through the `DraftInsights` port: public high-rank hero stats, matchup tables for the
   heroes involved, and (from OpenDota's SQL explorer) tournament picks and bans, pro pairings, pro positions and pro
   lane results.
3. `rankCandidates` scores every legal hero (see [draft-engine.md](draft-engine.md)). For the AI captain, a language
   model picks from the shortlist and explains; the choice is validated, with the top candidate as the fallback.
4. `draftOutlook` builds the outlook and report card; the AI review (on request) adds the language model's reading.

### Draft rooms

Rooms use polling with optimistic concurrency ([ADR 0003](adr/0003-multiplayer-draft-transport.md)): each room has a
revision; actions carry the version the client saw and an idempotency key; room events are append-only with a unique
`(roomId, sequence)`. Turn timeouts are resolved lazily and deterministically on read, so every viewer agrees. Finished
drafts are recorded once in `draft_history`.

## Caching

| Layer | What | Lifetime |
| --- | --- | --- |
| `ProviderGateway` (in memory, per instance) | OpenDota and Valve GET responses; also retries, timeouts, a circuit breaker and in-flight dedup | per call site (minutes to a day) |
| `draft_meta_cache` (MongoDB) | OpenDota explorer results (tournament data, pairings, positions, lanes) | fresh 12 h, served stale up to 7 days while it refreshes |
| Vercel Cron | Refreshes patches and warms the explorer cache daily | `0 6 * * *` |
| Draft reviews | Cached per draft, positions and model in `draft_meta_cache` | 7 days |

Optional shared Redis caching, rate limiting and background jobs are described in
[configuration.md](configuration.md#redis-and-background-jobs-optional).
