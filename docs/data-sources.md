# Data sources

## OpenDota

All calls go through `ProviderGateway` (`src/modules/shared/infrastructure/provider-gateway.ts`): timeouts, bounded
retries with jitter that honour `Retry-After`, a circuit breaker, in-flight de-duplication and a TTL cache. Failures
degrade the page section that needed the data ("unavailable right now"), never the whole page.

**API endpoints used**

| Endpoint                            | Used for                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /players/{id}`                 | Profile, rank tier, leaderboard rank                                                                       |
| `GET /players/{id}/matches`         | Match import; lane data (`project=lane_role`, …) for positions; per-hero GPM/XPM and purchases             |
| `GET /players/{id}/wl`              | Win/loss totals                                                                                            |
| `GET /players/{id}/heroes`          | Per-hero records; `?hero_id=` for matchups on one hero                                                     |
| `GET /players/{id}/peers`           | Teammates and opponents                                                                                    |
| `POST /players/{id}/refresh`        | Ask OpenDota to re-fetch a player's history (first sync or empty history)                                  |
| `GET /matches/{id}`                 | Match pages, party detection for Together                                                                  |
| `GET /search?q=`                    | Player search                                                                                              |
| `GET /heroStats`                    | Public win rates by bracket (Ancient+ = brackets 6-8 combined), trends, pro picks                          |
| `GET /heroes/{id}/matchups`         | Head-to-head records                                                                                       |
| `GET /scenarios/laneRoles?hero_id=` | Lane win rates (Meta page)                                                                                 |
| `GET /constants/*`                  | Heroes, items, abilities, patches (hero kits for the AI review come from `hero_abilities` and `abilities`) |

**SQL explorer** (`GET /explorer?sql=`, pro and public match tables). Slow queries get their own gateway (30 s timeout,
own circuit breaker) and are cached in MongoDB (`draft_meta_cache`: fresh 12 h, served stale up to 7 days while
refreshing), warmed by the daily cron.

| Query                                            | Window       | Feeds                                  |
| ------------------------------------------------ | ------------ | -------------------------------------- |
| Pro picks, bans and wins per hero                | 21 days      | Tournament priority, pro win rate      |
| Leagues in the window                            | 21 days      | "PGL Wallachia and 6 more tournaments" |
| Same-team pro pairs                              | 60 days      | Pairings (combos)                      |
| Pro positions (lane role + gold per minute rank) | 60 days      | Positions 1-5                          |
| Pro lane meetings (gold at 10 minutes)           | 60 days      | Lane matchups                          |
| Pro picks/bans, lane duos (Meta page)            | 21 / 60 days | Meta by role                           |
| `public_matches` (ranked Divine+ All Pick)       | 14 days      | `npm run draft:calibrate` only         |

**Limits and keys.** Without a key, OpenDota's free tier allows roughly 60 requests a minute and a few thousand a day,
shared by everyone using the app from the same server. To raise it, create an API key in your OpenDota account
(opendota.com → sign in → API Keys; it's billed per call beyond the free allowance) and set `OPENDOTA_API_KEY` in both
Vercel environments. The key is sent as the `api_key` query parameter; logs record request paths only.

## Valve patch datafeed

`www.dota2.com/datafeed/patchnoteslist` and `/patchnotes?version=` for official patch notes, imported into MongoDB by
the daily cron or by an admin ([ADR 0006](adr/0006-patch-ingestion.md)). Pages link back to the official notes.

## Groq (language model)

OpenAI-compatible chat completions at `api.groq.com`, model `openai/gpt-oss-120b` by default (`DRAFT_AI_MODEL`).
Used for the AI captain's pick and reason, and the AI review. JSON responses are validated; failures fall back to data
only. To set up billing and your own key: create an account at console.groq.com, add a payment method if you want
higher limits, create an API key, and set `GROQ_API_KEY` in both Vercel environments (sensitive). Any OpenAI-compatible
model name Groq serves can be set with `DRAFT_AI_MODEL`.

## Steam

Steam OpenID 2.0 for sign-in ([ADR 0001](adr/0001-steam-openid-and-sessions.md)). SteamID64 is always handled as a
string and converted with BigInt (`src/modules/identity/domain/steam-id.ts`). `STEAM_WEB_API_KEY` (optional) enables
resolving custom profile URLs in player search.
