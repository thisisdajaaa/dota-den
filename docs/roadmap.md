# Roadmap

What we could build next, with the reasons. Each item has a GitHub issue with the details
and what "done" means; this page is the overview. Shipped work is in
[CHANGELOG.md](../CHANGELOG.md).

**Priorities:** P1 do next · P2 soon · P3 later. Items marked _needs key_ are blocked on an API
key or account setup, not on code.

## Turn on (code done, needs a key)

These are built and tested; each starts working when its keys are set in Vercel (see
[configuration](configuration.md)). Push notifications, Twitch and Steam keys are set.

| Feature                                 | Still needed                                                                                                                        | Issue                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Weekly email digest and bounce handling | A Resend account and verified sending domain: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` (`EMAIL_TOKEN_SECRET` is set) | [#10](https://github.com/thisisdajaaa/dota-den/issues/10), [#24](https://github.com/thisisdajaaa/dota-den/issues/24) |
| Higher OpenDota limits                  | `OPENDOTA_API_KEY`                                                                                                                  | [#14](https://github.com/thisisdajaaa/dota-den/issues/14)                                                            |
| Durable background imports (QStash)     | `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`                                                             | [#15](https://github.com/thisisdajaaa/dota-den/issues/15)                                                            |

## Principles for new features

- **Honest numbers.** Never invent MMR, party membership or win chances. Estimates are labelled;
  small samples are shown with their size or hidden.
- **The player's data stays theirs.** Logged MMR, notes and goals are private unless a player opts in.
- **Gentle with OpenDota.** Cache, share caches across servers, and keep calls per page small.
- **Every feature ships with tests** (unit for the logic, E2E for the page) and goes through staging
  before production.
