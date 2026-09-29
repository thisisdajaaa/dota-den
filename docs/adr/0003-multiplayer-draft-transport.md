# ADR 0003 — Multiplayer draft transport

- Status: Accepted (revisit at M2 kickoff)
- Date: 2026-09-29

## Context

Multiplayer draft rooms (M2) need server-validated actions, an authoritative
timer, reconnect and resync, and "simultaneous actions resolve once" (§3). The
deployment target is Vercel functions, which cannot hold durable WebSocket
state. The spec allows Mongo polling for a small, explicitly capped prototype.

## Decision

- **The source of truth is always Mongo.** `draft_rooms` stores a snapshot with
  `stateVersion`, and `draft_events` is an append-only log with a unique
  `{roomId, sequence}` index. An action is committed with a conditional update on
  `stateVersion` together with an event insert. A stale client gets `409` and
  resyncs.
- The timer is authoritative through stored `turnDeadline` timestamps. Expiry is
  resolved lazily by the next read or write, using the same reducer, so it is
  deterministic without a server clock loop.
- **Transport sits behind a `DraftChannel` port:**
  - _Prototype (M2 start):_ clients short-poll
    `GET /api/v1/drafts/:id/events?after=<seq>` every ~1s while the room is
    active. Limits are enforced: at most 50 concurrently active rooms and at most
    12 participants per room, behind a feature flag.
  - _Scale-up:_ a managed pub/sub provider (Ably, Pusher, or similar) publishes
    committed events after the Mongo commit. Clients still resync from the events
    endpoint on reconnect. The provider is chosen at M2 kickoff after a terms and
    pricing review.
- M1 local drafts use the same pure reducer and ruleset modules entirely in the
  browser, so no transport is needed.

## Consequences

- The M1 draft engine must be pure and serializable, because M2 reuses it
  server-side.
- Polling costs function invocations, so budget alerts (§12) need to cover draft
  polling volume.
