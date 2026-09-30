# API reference

All routes live under `src/app/api`. Responses are JSON.

## Conventions

- **Errors** have one shape: `{ "error": { "code", "message", "details"? } }`.

  | code                   | HTTP |
  | ---------------------- | ---- |
  | `bad_request`          | 400  |
  | `unauthorized`         | 401  |
  | `forbidden`            | 403  |
  | `not_found`            | 404  |
  | `conflict`             | 409  |
  | `rate_limited`         | 429  |
  | `internal`             | 500  |
  | `upstream_unavailable` | 503  |

- **Auth** is the `dd_session` cookie set by Steam sign-in. "Signed in" routes answer 401 without it.
- **Same-origin**: every state-changing route requires an `Origin` header equal to `APP_URL` (403 otherwise).
- **Rate limits** are per client IP unless noted; defaults and variables are in [configuration.md](configuration.md#operator-tuning).
- **Draft snapshots** are compact encoded draft states (ruleset, first side, the sequence of heroes). The server always
  replays them through the rules engine; an illegal or tampered snapshot is a 400.

## Health and auth

| Method & path                     | Auth        | Notes                                                                                    |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `GET /api/health`                 | none        | `{status, db, latencyMs}`; 503 `{status: "degraded"}` when MongoDB is unreachable        |
| `GET /api/v1/auth/steam/login`    | none        | Redirects to Steam OpenID (test mode: signs in a fake user; `?as=<SteamID64>` picks one) |
| `GET /api/v1/auth/steam/callback` | none        | Verifies the OpenID response and state cookie, creates the session, redirects            |
| `POST /api/v1/auth/sign-out`      | same-origin | Ends the session                                                                         |
| `GET /api/v1/me`                  | signed in   | `{id, steamId64, accountId32, persona, settings, isAdmin}`; rotates the session cookie   |

## You

| Method & path                            | Auth                                    | Body → response                                                                                            |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/me/matches/sync`           | signed in, same-origin                  | Sync your matches. 429 with `retryAt` during the cooldown; 409 while a sync is running                     |
| `GET /api/v1/me/follows`                 | signed in                               | `{follows, limit}`                                                                                         |
| `POST /api/v1/me/follows`                | signed in, same-origin, rate limited    | `{accountId32}`: track a player                                                                            |
| `DELETE /api/v1/me/follows/{accountId}`  | signed in, same-origin, rate limited    | Stop tracking                                                                                              |
| `GET /api/v1/me/patch-watchlist`         | signed in                               | `{heroIds, itemIds, updatedAt}`                                                                            |
| `PUT /api/v1/me/patch-watchlist`         | signed in, same-origin                  | `{heroIds, itemIds?}`                                                                                      |
| `GET /api/v1/me/settings/session-gap`    | signed in                               | `{gapMinutes}`                                                                                             |
| `PUT /api/v1/me/settings/session-gap`    | signed in, same-origin, 20/min per user | `{gapMinutes: 30 \| 60 \| 90 \| 120}`                                                                      |
| `PUT /api/v1/me/settings/visibility`     | signed in, same-origin, 20/min per user | `{profileVisibility: "private" \| "friends" \| "public"}`; "public" lists you on the Everyone leaderboards |
| `POST /api/v1/mmr-entries`               | signed in, same-origin                  | `{mmr, observedAt, note?}` → 201 with the entry                                                            |
| `PATCH /api/v1/mmr-entries/{id}`         | signed in, same-origin                  | Update your entry                                                                                          |
| `DELETE /api/v1/mmr-entries/{id}`        | signed in, same-origin                  | Delete your entry                                                                                          |
| `PUT /api/v1/sessions/{sessionId}/notes` | signed in, same-origin, 30/min per user | `{note?, goal?, goalMet?: "yes" \| "no" \| "partly"}`; 404 for another account's session                   |

## Patches

| Method & path                        | Auth                                 | Notes                                                             |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------- |
| `GET /api/v1/patches`                | none                                 | Imported patches, newest first                                    |
| `GET /api/v1/patches/{version}`      | none                                 | One patch's notes                                                 |
| `POST /api/v1/admin/patches/refresh` | admin, same-origin                   | `{version?}` or `{count?}`: import from Valve's feed              |
| `GET /api/cron/patches`              | `Authorization: Bearer $CRON_SECRET` | Daily: import new patches and warm the draft AI's tournament data |

## Drafts

| Method & path                          | Auth                           | Rate limit             | Body → response                                                                                                                                                   |
| -------------------------------------- | ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/drafts/ai-move`          | same-origin                    | AI move                | `{snapshot, aiSide}` → `{action, side, heroId, reason, source: "model" \| "heuristic", model}`                                                                    |
| `POST /api/v1/drafts/suggestions`      | same-origin                    | suggestions            | `{snapshot, side}` → `{action, situation, candidates[{heroId, name, role, position, facts}]}`                                                                     |
| `POST /api/v1/drafts/outlook`          | same-origin                    | outlook                | `{snapshot, roles?: {radiant?, dire?: {heroId: position}}}` → the draft outlook (estimate, breakdown, lanes, positions, report card, hero stats, notes, accuracy) |
| `POST /api/v1/drafts/review`           | same-origin                    | review                 | `{snapshot, roles?}` → `{review, model, report, adjusted}`. 409 if the draft isn't finished; 503 if no model is configured or it's unavailable                    |
| `POST /api/v1/drafts/results`          | signed in, same-origin         | 10 per 10 min per user | `{snapshot, aiSide: side \| null}`: record a finished draft for the leaderboards. Counted once per draft                                                          |
| `POST /api/v1/drafts/challenges/grade` | same-origin (sign-in optional) | challenges             | `{type, seed, heroIds}` → grade, choices, best alternatives. Signed-in answers are recorded (first answer per puzzle)                                             |

### Draft rooms

| Method & path                                   | Auth                         | Rate limit  | Notes                                                                                                                                             |
| ----------------------------------------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/drafts/rooms`                     | signed in, same-origin       | room create | `{rulesetId, firstSide, hostSide, timerEnabled}` → 201 `{roomId}`                                                                                 |
| `GET /api/v1/drafts/rooms/{roomId}?rev=&after=` | optional                     | room poll   | `{unchanged: true, serverNow}` or `{room, events}`                                                                                                |
| `POST …/{roomId}/join`                          | signed in, same-origin       | room action | `{side}`                                                                                                                                          |
| `POST …/{roomId}/leave`                         | signed in, same-origin       | room action |                                                                                                                                                   |
| `POST …/{roomId}/start`                         | host, same-origin            | room action | Both seats must be taken                                                                                                                          |
| `POST …/{roomId}/actions`                       | captain or host, same-origin | room action | `{action: {type: "pick" \| "ban", heroId} \| {type: "pause" \| "resume"}, expectedVersion, idempotencyKey}`. 409 `stale` returns the current room |
| `POST …/{roomId}/rematch`                       | host, same-origin            | room action | → `{roomId}` of the rematch (first pick swaps)                                                                                                    |
| `GET …/{roomId}/result`                         | optional                     | room poll   | The self-reported game result, if any                                                                                                             |
| `POST …/{roomId}/result`                        | a captain, same-origin       | room action | `{winner: "radiant" \| "dire" \| "not_played"}`                                                                                                   |

Room ids are 10 random letters and digits; anything else is a 404.
