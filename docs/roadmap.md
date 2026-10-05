# Roadmap

What we could build next, with the reasons. Each item has a GitHub issue with the details
and what "done" means; this page is the overview. Shipped work is in
[CHANGELOG.md](../CHANGELOG.md).

**Priorities:** P1 do next · P2 soon · P3 later. Items marked _needs key_ are blocked on an API
key or account setup, not on code.

## Do next (P1)

| Feature                                      | Why                                                                                                  | Issue                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Grade the drafts of your real ranked matches | Players want to know if a game was lost in the draft or in the game; the draft engine already exists | [#2](https://github.com/thisisdajaaa/dota-den/issues/2) |
| Export your data and delete your account     | MMR logs, notes and goals only live here; players should be able to take them or remove everything   | [#3](https://github.com/thisisdajaaa/dota-den/issues/3) |

## Soon (P2)

| Feature                                            | Why                                                                          | Issue                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Weekly goals                                       | A light reason to come back each week, measured from the weekly recap's data | [#4](https://github.com/thisisdajaaa/dota-den/issues/4)   |
| Ward and death map                                 | The most useful replay data after laning and item timings                    | [#5](https://github.com/thisisdajaaa/dota-den/issues/5)   |
| Tag and annotate matches                           | Record why a game went wrong; see your record per tag                        | [#6](https://github.com/thisisdajaaa/dota-den/issues/6)   |
| Patch impact on your heroes                        | Did a patch change how you do on your heroes, not just what changed          | [#7](https://github.com/thisisdajaaa/dota-den/issues/7)   |
| Watch live games in the app (Twitch) _(needs key)_ | Code is done; needs Twitch app credentials                                   | [#11](https://github.com/thisisdajaaa/dota-den/issues/11) |
| Friends playing now _(needs key)_                  | Who's in a game right now; needs a Steam Web API key                         | [#12](https://github.com/thisisdajaaa/dota-den/issues/12) |
| Discord feed for your group _(needs key)_          | Post finished games to the group's channel; needs a webhook                  | [#13](https://github.com/thisisdajaaa/dota-den/issues/13) |
| OpenDota API key _(needs key)_                     | Higher limits: fewer "OpenDota is busy" syncs, faster search                 | [#14](https://github.com/thisisdajaaa/dota-den/issues/14) |

## Later (P3)

| Feature                                           | Why                                                                      | Issue                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Best stacks                                       | Which party combinations win most, where party data confirms it          | [#8](https://github.com/thisisdajaaa/dota-den/issues/8)   |
| Filipino / Cebuano translations                   | The main user group's languages                                          | [#9](https://github.com/thisisdajaaa/dota-den/issues/9)   |
| Weekly email digest _(needs key)_                 | Brings back players who forget the app; opt-in only                      | [#10](https://github.com/thisisdajaaa/dota-den/issues/10) |
| Durable background imports (QStash) _(needs key)_ | Long imports finish within minutes of sign-in, not the next day          | [#15](https://github.com/thisisdajaaa/dota-den/issues/15) |
| Isolate E2E tests from each other                 | Any spec should pass alone or in any order                               | [#16](https://github.com/thisisdajaaa/dota-den/issues/16) |
| Accessibility audit                               | A full keyboard, screen reader and contrast pass, plus axe checks in E2E | [#17](https://github.com/thisisdajaaa/dota-den/issues/17) |

## Principles for new features

- **Honest numbers.** Never invent MMR, party membership or win chances. Estimates are labelled;
  small samples are shown with their size or hidden.
- **The player's data stays theirs.** Logged MMR, notes and goals are private unless a player opts in.
- **Gentle with OpenDota.** Cache, share caches across servers, and keep calls per page small.
- **Every feature ships with tests** (unit for the logic, E2E for the page) and goes through staging
  before production.
