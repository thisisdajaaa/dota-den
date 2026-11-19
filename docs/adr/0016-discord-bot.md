# ADR 0016: The Dota Den Discord bot (HTTP interactions, Plus AI commands, server recap)

- Status: Accepted (built; off until the Discord app keys are set, see docs/discord-setup.md)
- Date: 2026-11-19
- Extends: ADR 0013 (Plus), ADR 0014 (AI coach), ADR 0015 (Ask Den), ADR 0008 (jobs)

## Context

Most players are in the Philippines and gather on Discord. Since 2026-10-25 a player can link
their Discord account (OAuth2 `identify`) and use `/den me` and `/den leaderboard`. The roadmap
(Plus row 6) adds the AI features to Discord, a weekly report to a server, and stop-loss / tilt
reminders where the group already is. Dota Den runs on Vercel functions: there is no process to
hold a Discord gateway websocket.

## Decision

### Transport: HTTP interactions only

Discord POSTs every slash command to `POST /api/v1/discord/interactions`. The Ed25519
signature (`X-Signature-Ed25519` over `X-Signature-Timestamp` + the raw body, with the app's
public key) is checked before anything is parsed; without `DISCORD_PUBLIC_KEY` the route is a 404. No gateway, no presence, no reading of member lists or messages: the bot only knows what an
interaction tells it (caller, server, channel, the caller's permissions).

**Discord's 3-second limit.** Quick commands (`me`, `leaderboard`, `lang`, `recap`,
`nudges`, `help`) answer directly. Slow ones (`coach`, `ask`, `pick`, `setup`) answer type 5
("thinking…", private unless `share:true`), and the work runs in `after()` (the route's
`maxDuration` is 60 s), then edits the original answer through the interaction webhook
(`PATCH /webhooks/{app}/{token}/messages/@original`, valid 15 minutes, no bot token needed).
Any failure becomes a "something went wrong" edit; nothing is left spinning. We chose `after()`
over a QStash job: the token is a short-lived secret we'd rather not put in a queue, and the
work fits well within 60 s (the coach's two model calls are capped at 25 s each).

### Commands (one `/den` command with subcommands)

| Command                                           | Plan  | Notes                                                                    |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `/den me`                                         | Free  | Last 7 days, last 10 games, most played heroes (30 days)                 |
| `/den leaderboard`                                | Free  | Ranked wins this week among linked members who used `/den` in the server |
| `/den lang [language]`                            | Free  | Shows or sets the player's **site** language (one setting)               |
| `/den recap [on]`                                 | Free  | The member's own opt-in to this server's Monday recap                    |
| `/den nudges [where: off/dm/server]`              | Free  | Stop-loss reminders (free) and tilt warnings (Plus) on Discord           |
| `/den setup [channel] [recap] [nudges] [lang]`    | Admin | Manage Server or Administrator; turning the recap **on** needs Plus      |
| `/den coach [match] [share]`                      | Plus  | The AI match coach's review of the latest (or given) match               |
| `/den ask question [share]`                       | Plus  | Ask Den                                                                  |
| `/den pick enemy1..5 ally1..4 [position] [share]` | Plus  | "Pick for me", heroes autocompleted                                      |
| `/den help`                                       | Free  | What the bot does and how to link                                        |

**Reuse, not new AI.** `/den coach` calls `matchCoachService.review`: a stored review (same
match, model, prompt version and language) is returned without a model call or quota use, and a
new one goes through the coach's quota, shared AI budget and number checks (ADR 0014). `/den ask`
calls `askService.reserve` + `answer`: the **same Manila-day allowance** as `/ask` (a Discord
question counts on the site and the other way round), the same tool grounding and checker, and
the question joins the site chat history (ADR 0015). `/den pick` calls `pickForMeService.suggest`
(no model; never a win probability). The coach card's cited numbers are shown from the stored
fact sheet, never the model's text.

**Plus split.** On the site Ask Den and "Pick for me" also have free tiers; on Discord they are
Plus, as the roadmap row says. A non-Plus member gets a private "this is a Plus command" reply
before any work, quota or budget is touched. Staff Plus (ADR 0013 addendum) applies.

**Privacy.** Replies with the caller's own AI output are **private by default** (ephemeral);
`share:true` posts them for the channel. Ask Den can read the private MMR journal, which is why
sharing is opt-in per question. Mentions are switched off in every message (`allowed_mentions:
{parse: []}`), names are markdown-escaped.

**Language.** The player's Dota Den language when linked and set, else the server's (from
`/den setup language:`), else English. Discord has no Filipino or Cebuano client locale, so the
interaction's `locale` is ignored. `/den lang` writes the site setting.

**Rate limits.** Per Discord user, on the shared limiter: 20 commands a minute, and 5 AI/slow
commands per 10 minutes, besides the route's per-IP limit and each service's own limits.
Usage counters: `discord_command` per command (as before), plus the features' own counters
(`coach_review`, `ask_den`, `pick_for_me`), and new `discord_recap` and `discord_nudge`.

### Server recap (Plus)

- A server admin runs `/den setup recap:true` in the server. That person must have Plus; their
  Dota Den user id is stored on the server's settings, and the recap **stops while they don't
  have Plus** (checked when each recap runs). Changing other settings keeps the recap theirs.
- Setup posts a short "Dota Den will post here" message right away, so missing channel
  permissions show up at once rather than on Monday.
- **Only members who opted in** with `/den recap on:true` in that server appear (linking alone
  is not consent to be posted about weekly). The recap is last week's (Monday–Sunday, Manila
  time, the weekly coach's week) ranked games: members, games, record, the top five by ranked
  wins (ties: fewer games), and the server's most played hero with its record. No MMR, no party
  inferences, nothing estimated. A week with no ranked games posts nothing.
- Schedule `dota-den-discord-recap`, `0 1 * * 1` (Monday 09:00 Manila), job `discord-recap`
  queues one `discord-recap-post` per server whose last posted week isn't this one, with dedup
  key `discord-recap-<guild>-<week>` (letters, digits and `-` only: QStash-safe). The post is
  also claimed in `discord_bot_log` and the server's `lastRecapWeek` is set, so a retry never
  posts twice. Discord busy or down → the job throws and QStash retries; 403/404 (channel gone,
  permissions lost) → logged, not retried.

### Nudges

- A member chooses `/den nudges where:dm` (also on the account page) or `where:server` (in a
  server whose admin turned `nudges` on in `/den setup`; posts to the bot channel there, with
  the member's name). Default: off.
- They ride on the session companion (every 5 minutes, ADR 0013/0014): the companion now also
  considers players with Discord nudges on, not only players with a push device. **The same
  notification settings decide**: a stop-loss nudge needs an active stop-loss and `stop_loss`
  on; a tilt nudge needs Plus and `session_live` on, and only goes out when the companion's tilt
  warning (from the player's own history) fires. Every finished game is not a Discord message.
- Once per occasion: `nudge:<user>:<kind>:<session-rule or match>` in `discord_bot_log`. A DM
  that Discord refuses (DMs closed, no shared server) is not retried.

### Storage

- `discord_links` (existing) gains `recapGuilds` (servers where the member opted in to the
  recap) and `nudges` (`{where: "dm" | "server", guildId}` or null). Index `by_recap_guild`,
  `by_nudges`.
- `discord_guilds`: one document per server: channel, `recap`, `nudges`, language, the user id
  and Discord id of who set it up, `lastRecapWeek`.
- `discord_bot_log`: claims for recaps and nudges, TTL 30 days.
- "Download your data" includes `discordServers` and `discordBotPosts`; deleting the account
  deletes the link, the server settings they made (ending that server's recap) and their nudge
  log.

### Safely off by default

| Missing                    | Effect                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `DISCORD_PUBLIC_KEY`       | Interactions route 404; no invite link on the account page                                 |
| `DISCORD_CLIENT_ID`/SECRET | No "Connect Discord"                                                                       |
| `DISCORD_BOT_TOKEN`        | Commands still work; `/den setup` and nudges say they aren't set up; recap tick is a no-op |
| Groq key / `ASK_ENABLED`   | `/den coach` / `/den ask` say they aren't set up                                           |

## Consequences

- A slash-command interaction now runs up to 60 s of function time for AI commands (after the
  response), within the existing AI budget.
- Server membership is only what interactions reveal: a member who left a server stays in its
  lists until they unlink, and the recap only includes people who opted in there.
- Global command updates can take time to propagate; `npm run discord:commands -- --guild <id>`
  registers them instantly for a test server.
