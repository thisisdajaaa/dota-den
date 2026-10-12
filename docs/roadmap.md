# Roadmap

What we could build next, with the reasons. Each item has a GitHub issue with the details
and what "done" means; this page is the overview. Shipped work is in
[CHANGELOG.md](../CHANGELOG.md).

**Priorities:** P1 do next · P2 soon · P3 later. Items marked _needs key_ are blocked on an API
key or account setup, not on code.

## Turn on (code done, needs a key)

These are built and tested; each starts working when its keys are set in Vercel (see
[configuration](configuration.md)).

| Feature                              | Keys                                                                                 | Issue                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Push notifications                   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                             | [#19](https://github.com/thisisdajaaa/dota-den/issues/19) |
| Friends playing now                  | `STEAM_WEB_API_KEY`                                                                  | [#12](https://github.com/thisisdajaaa/dota-den/issues/12) |
| Weekly email digest                  | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TOKEN_SECRET` (and a verified sending domain) | [#10](https://github.com/thisisdajaaa/dota-den/issues/10) |
| Watch live games in the app (Twitch) | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`                                           | [#11](https://github.com/thisisdajaaa/dota-den/issues/11) |
| Higher OpenDota limits               | `OPENDOTA_API_KEY`                                                                   | [#14](https://github.com/thisisdajaaa/dota-den/issues/14) |
| Durable background imports (QStash)  | `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`              | [#15](https://github.com/thisisdajaaa/dota-den/issues/15) |

## Soon (P2)

| Feature                   | Why                                                     | Issue                                                     |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Stable preview image URLs | Discord posts and other embeds can show the match image | [#23](https://github.com/thisisdajaaa/dota-den/issues/23) |

## Later (P3)

| Feature                      | Why                                                | Issue                                                     |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Email bounces and complaints | Stop emailing addresses that bounce or report spam | [#24](https://github.com/thisisdajaaa/dota-den/issues/24) |

## Principles for new features

- **Honest numbers.** Never invent MMR, party membership or win chances. Estimates are labelled;
  small samples are shown with their size or hidden.
- **The player's data stays theirs.** Logged MMR, notes and goals are private unless a player opts in.
- **Gentle with OpenDota.** Cache, share caches across servers, and keep calls per page small.
- **Every feature ships with tests** (unit for the logic, E2E for the page) and goes through staging
  before production.
