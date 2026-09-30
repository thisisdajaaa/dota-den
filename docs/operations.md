# Operations

## Environments

| Branch    | Environment                             | URL                                 | Database   |
| --------- | --------------------------------------- | ----------------------------------- | ---------- |
| `develop` | Staging (Vercel preview, branch-scoped) | https://dota-den-develop.vercel.app | `dota_den` |
| `main`    | Production                              | https://dota-den.vercel.app         | `dota_den` |

Staging and production currently share configuration ("for now, the same") and the Atlas database `dota_den`.
Vercel's Git auto-deploys are off (`vercel.json`); all deploys go through GitHub Actions.

## CI/CD

`.github/workflows/ci-cd.yml`, on every push to `develop` or `main`:

1. **Lint, typecheck, test, build**: `npm run check` and `npm run build` with a MongoDB service container.
2. **End-to-end**: Playwright against the fixture OpenDota/Valve server.
3. **Deploy**: `vercel pull`, `vercel build`, `vercel deploy --prebuilt` for the branch's environment; staging is
   aliased to `dota-den-develop.vercel.app`; then `npm run db:indexes` against that environment's database and a
   smoke test (`/api/health`). Staging's smoke test uses `VERCEL_AUTOMATION_BYPASS_SECRET` for deployment protection.

GitHub environments `production` and `staging` are restricted to `main` and `develop` and hold that environment's
secrets (Vercel token, org and project ids, MongoDB URI, bypass secret).

**Releasing:** merge feature branches into `develop`, let staging go green, then merge `develop` into `main`.

## Cron

`vercel.json` runs `GET /api/cron/patches` daily at 06:00 UTC with `Authorization: Bearer $CRON_SECRET`. It imports
new patches and refreshes the draft AI's cached tournament data. Without `CRON_SECRET` the route answers 503.

`GET /api/cron/matches` runs daily at 06:30 UTC with the same secret. It syncs every player's matches, unfinished
histories first, for up to 45 seconds (20 pages each), so long imports finish and new games arrive without the player
visiting. With QStash configured, long imports also continue in the background right after a visit.

## Database

### Backups

`.github/workflows/backup.yml` dumps the production database every night at 18:00 UTC (and on demand from the
Actions tab), encrypts it with AES-256 using the `BACKUP_PASSPHRASE` secret of the `production` environment, and keeps
it as a workflow artifact for 30 days. Sessions, sign-in nonces and cached tournament data are left out; they rebuild on
their own. The repo is public, so never upload an unencrypted dump.

To restore:

```sh
gh run download <run-id> -R thisisdajaaa/dota-den        # or download the artifact from the run page
gpg --decrypt dota-den-<date>.archive.gz.gpg > dump.archive.gz   # asks for the passphrase
mongorestore --uri="$MONGODB_URI" --gzip --archive=dump.archive.gz --nsInclude='dota_den.*' --drop
```

`--drop` replaces each restored collection; leave it out to merge. Run `npm run db:indexes` afterwards.

- `npm run db:indexes` creates or updates every index (idempotent; CI runs it on each deploy).
- TTL indexes expire sessions, nonces, draft rooms (24 h after the last move), and cached explorer data (7 days).
- No transactions: correctness relies on unique indexes and optimistic concurrency
  ([ADR 0002](adr/0002-mongodb-driver-strategy.md)).

## Secrets

Set as sensitive environment variables in Vercel (per environment) and as GitHub environment secrets; never in the
repo. Rotate a secret by setting the new value in Vercel (and GitHub if CI uses it) and redeploying the branch.
Rotating `CRON_SECRET` needs no other change; rotating the MongoDB password needs `MONGODB_URI` updated in both places.

## Refreshing the draft calibration

Run `npm run draft:calibrate` locally (ideally with `OPENDOTA_API_KEY`), review the printed held-out accuracy, and
commit the updated `draft-calibration.json` through the normal flow. Worth doing after a major patch.

## Troubleshooting

| Symptom                                                       | Likely cause                                                            | What to do                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Pages show "unavailable right now" for OpenDota sections      | Rate limited (429) or OpenDota down; the circuit breaker opened         | Wait a minute; set `OPENDOTA_API_KEY` for higher limits                          |
| Draft AI works but without tournament facts                   | Explorer query timed out on a cold cache                                | It's warmed by cron and refreshed in the background; retry shortly               |
| AI captain moves marked "rule-based"                          | No `GROQ_API_KEY`, or the model timed out or answered off the shortlist | Check the key and `DRAFT_AI_MOVE_TIMEOUT_MS`                                     |
| A friend's matches are missing                                | Their OpenDota profile is private or not yet refreshed                  | They enable "Expose public match data" in Dota; the app asks OpenDota to refresh |
| Playwright runs time out or the machine runs out of memory    | Two E2E suites (dev servers) at once                                    | Run one suite at a time, with `--workers=2`                                      |
| `Type '"/route"' does not satisfy the constraint 'AppRoutes'` | Route types are stale                                                   | `npx next typegen`                                                               |
