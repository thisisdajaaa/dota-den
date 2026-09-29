# ADR 0002 — MongoDB driver strategy

- Status: Accepted
- Date: 2026-09-29

## Context

Storage is MongoDB Atlas (§7). We need idempotent upserts, unique and compound
indexes, conditional updates for draft optimistic concurrency, TTL indexes, and
schema versioning. Validation already uses Zod at every trust boundary.

## Decision

- Use the **official `mongodb` Node driver** directly, **not Mongoose**.
  - The domain model lives in plain TypeScript. Mongoose schemas would duplicate
    Zod and domain types and tempt UI or domain code to import models.
  - The driver gives us direct control of `updateOne(..., { upsert })`,
    `findOneAndUpdate` with a `stateVersion` guard, and transactions.
- `src/lib/db/mongo.ts` exposes `getDb()`. The `MongoClient` is cached on
  `globalThis` per warm instance (and across HMR in dev), with
  `maxPoolSize` set by `MONGODB_MAX_POOL_SIZE` (default 10, suited to
  serverless).
- Each bounded context owns its collections and exports
  `ensure<Context>Indexes(db)` from its infrastructure layer.
  `npm run db:indexes` applies them all, and integration tests apply them
  before each suite.
- Every persisted document carries `schemaVersion`. Migrations live in
  `scripts/migrations/` and are tracked in a `_migrations` collection.
- Dates are stored as BSON `Date` in UTC. SteamID64 is stored as a **string**.
  `accountId32` is stored as a number, which is safe because it is below 2^32.
- Integration tests run against `MONGODB_TEST_URI` (default
  `mongodb://127.0.0.1:27017`). Locally this is a local `mongod`, and CI uses a
  Mongo service container. Each test file gets its own throwaway database, which
  is dropped afterwards.

## Consequences

- There is no ORM-level validation, so repositories must map documents to
  domain types explicitly. Mappers are small and tested.
- Cross-context reads go through application query services, never through
  another context's collections. Architecture tests enforce this.
