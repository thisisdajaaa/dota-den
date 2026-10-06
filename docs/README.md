# Dota Den documentation

| Document                          | What's in it                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)   | Feature module anatomy, data flows, caching                                                   |
| [Configuration](configuration.md) | Every environment variable: type, default, where it's used                                    |
| [API reference](api.md)           | Every route handler: method, auth, limits, request and response                               |
| [Draft engine](draft-engine.md)   | Rulesets, positions, lanes, scoring, outlook, report card, calibration, AI captain and review |
| [Data sources](data-sources.md)   | OpenDota endpoints and explorer queries, Valve feed, Groq, keys and limits                    |
| [Operations](operations.md)       | Deploys, cron, indexes, secrets, troubleshooting                                              |
| [Roadmap](roadmap.md)             | What we could build next, by priority, linked to GitHub issues                                |
| [Changelog](../CHANGELOG.md)      | Every production release, newest first                                                        |

## Decisions (ADRs)

| ADR                                             | Decision                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| [0001](adr/0001-steam-openid-and-sessions.md)   | Steam OpenID and server-side sessions                            |
| [0002](adr/0002-mongodb-driver-strategy.md)     | MongoDB with the official driver, no transactions                |
| [0003](adr/0003-multiplayer-draft-transport.md) | Multiplayer draft rooms over polling with optimistic concurrency |
| [0004](adr/0004-module-boundaries.md)           | Module boundaries and layer rules                                |
| [0005](adr/0005-draft-rulesets.md)              | Versioned draft rulesets                                         |
| [0006](adr/0006-patch-ingestion.md)             | Patch ingestion from Valve's datafeed                            |
| [0007](adr/0007-mmr-attribution.md)             | Exact vs estimated MMR attribution                               |
| [0008](adr/0008-redis-and-background-jobs.md)   | Shared state in Upstash Redis, background jobs in QStash         |

The product and engineering spec is `docs/spec.pdf`.
