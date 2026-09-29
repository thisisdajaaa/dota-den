# ADR 0006 — Patch ingestion

- Status: Accepted
- Date: 2026-09-30

## Context

The patch hub (spec §2.3) shows official patch notes with the official link, the
publication date, the section hierarchy and the parse status. Imports must be
idempotent, refresh daily plus on manual admin retry, and a parser failure must
keep the official link, not invent a summary. Hobby cron runs at most once a day
(§12).

## Decision

- **Source.** Valve's JSON datafeed, which backs the official patch page:
  `GET https://www.dota2.com/datafeed/patchnoteslist?language=english` (index)
  and `GET …/datafeed/patchnotes?version=<v>&language=english` (detail). All
  calls go through `ProviderGateway`. `ValvePatchAdapter` is the
  anti-corruption layer: it validates with Zod and maps each entry on its own.
  Ability and item ids are resolved to key, name and icon from OpenDota's
  constants. Ids that don't resolve stay as ids, and names are never guessed.
- **Canonical link.** Each patch stores `sourceUrl`
  (`https://www.dota2.com/patches/<version>`) and `feedUrl`. The UI always links
  `sourceUrl` as attribution.
- **Wording.** Note text is Valve's original wording. The parser only turns
  `<br>` into newlines, strips presentational tags (`<span>`, `<font>`) while
  keeping their text, and decodes basic entities. It never rewrites, summarizes
  or translates. Output is plain text, and the UI renders it as text.
- **Idempotency via content hash.** `contentHash` is the SHA-256 of the
  canonical upstream JSON, with keys sorted recursively. `patches` has a unique
  index on `version` (and `sourceUrl`). An import doesn't write anything when the
  stored hash and `parserVersion` match and names were already resolved. It
  replaces the document when the hash changes, when the parser version changes,
  or when names become resolvable. A replacement is a conditional update on the
  previous `parseRevision`, and the new document gets `parseRevision + 1`, so
  concurrent imports can't double-increment.
- **Degraded behaviour.**
  - A malformed entry, an unknown top-level section or a section of the wrong
    type sets `parseStatus: "partial"`. The reasons go in `parseIssues` (capped),
    and the valid entries are still stored.
  - An unusable payload (no header, a version mismatch, no valid entries) is
    `failed`.
  - When a fetch fails and nothing is stored yet, a `failed` placeholder is
    stored if the version appears in the official index. It keeps the version,
    name, date and official link, with empty sections.
  - A failed fetch or a failed parse never overwrites stored content that was
    usable.
  - If the OpenDota constants are unavailable, the patch is stored anyway with
    `referencesResolved: false`, and the next import fills in the names.
- **Refresh.**
  - `GET /api/cron/patches` runs daily through Vercel Cron and imports the
    newest 3 versions. The `Authorization` header must be
    `Bearer $CRON_SECRET`; the route returns 503 when the secret is unset.
  - `POST /api/v1/admin/patches/refresh` is admin-only and same-origin.
  - Pages call `ensurePatchesFresh()`. It imports only when no patches are
    stored or the last clean run is more than 24h old. It's throttled to one
    attempt per 10 minutes across instances through `patch_refresh_state`, and
    it never throws.
  - Every run logs its per-version outcomes, and failures log at `warn`
    (`patch_import_degraded`) so they can raise an alert (§10).
- **Watchlist** (`patch_watchlists`, unique `userId`) is its own aggregate. It
  holds up to 50 hero ids and 50 item ids and never embeds patch data.

## Consequences

- Upstream wording changes, including typo fixes, produce a new revision. That's
  intended, because stored notes must match the official page.
- Only English is imported for now. The `language` field leaves room for more.
- We store full note text so the hub can render sections. Before any commercial
  use or wider rehosting, we must review Valve's terms (§10).
