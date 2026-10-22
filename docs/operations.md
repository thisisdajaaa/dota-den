# Operations

## Environments

| Branch    | Environment                             | URL                                 | Database   |
| --------- | --------------------------------------- | ----------------------------------- | ---------- |
| `develop` | Staging (Vercel preview, branch-scoped) | https://dota-den-develop.vercel.app | `dota_den` |
| `main`    | Production                              | https://www.dota-den.com            | `dota_den` |

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

## Owner alerts

When something needs the owner, every admin (`ADMIN_STEAM_IDS`) gets a push notification on each device where they
turned notifications on (Account → Notifications), in their language. With `ADMIN_ALERT_WEBHOOK_URL` set (a Discord
webhook for a private channel; only `discord.com` webhook URLs are accepted) the alert is also posted there. The admin
page lists recent alerts under **Alerts**, with a **Send a test alert** button.

| Alert                  | When                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Daily job failed       | A cron run finished with `ok: false` (an exception, or the patch feed unavailable)                                             |
| Match sync failures    | The match sync ran, but more than 20% of the accounts it tried failed (and at least 2)                                         |
| Patch import degraded  | Some patch notes couldn't be imported (parser failures, spec §10)                                                              |
| Daily job stopped      | `patches` or `matches` hasn't completed on Vercel's schedule within 26 h (runs from the admin page don't count)                |
| OpenDota looks down    | The circuit breaker is open, the latest calls failed, or half the synced accounts failed upstream, at two checks 25+ min apart |
| Backup / restore drill | The backup or restore-drill workflow reported a failure                                                                        |

The checks run at the end of each cron run (each run checks both jobs, so `patches` watches `matches` and vice versa)
and whenever a backup or drill reports (the nightly backup is an outside watchdog for the crons). The same alert goes
out at most once every 6 hours (`owner_alert_throttle`, a TTL collection); sent alerts are kept 30 days
(`owner_alerts`), backup and drill outcomes 90 days (`ops_reports`). Alerts are also logged (`owner_alert`, warn).

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

Each backup run ends by reporting its outcome to `POST /api/cron/backup-report` (`Authorization: Bearer $CRON_SECRET`,
body `{ "job": "backup" | "restore-drill", "ok": true | false, "details": "…", "runUrl": "https://github.com/…" }`).
The admin page shows the outcomes next to the daily jobs, and a failure alerts the owner.

### Restore drill

`.github/workflows/restore-drill.yml` runs every Sunday at 20:00 UTC (and on demand). It downloads the latest successful
backup artifact (failing if it is older than 36 h), decrypts it with `BACKUP_PASSPHRASE`, restores it with
`mongorestore` into a throwaway MongoDB service container (production is never touched), and checks that `users`,
`player_match_facts`, `match_sync_state`, `patches` and `cron_runs` exist and hold documents, and that the excluded
collections (`auth_sessions`, `auth_nonces`, `draft_meta_cache`) are absent. Any problem fails the job and is reported
to the app like the backup.

**Secrets the workflows need** (GitHub → Settings → Environments → `production`):

| Name                | Kind     | Used by               | Notes                                                              |
| ------------------- | -------- | --------------------- | ------------------------------------------------------------------ |
| `MONGODB_URI`       | secret   | backup                | Already set                                                        |
| `BACKUP_PASSPHRASE` | secret   | backup, restore drill | Already set                                                        |
| `CRON_SECRET`       | secret   | backup, restore drill | **Add it**: the same value as `CRON_SECRET` in Vercel (production) |
| `APP_URL`           | variable | backup, restore drill | Optional; defaults to `https://www.dota-den.com`                   |

Without `CRON_SECRET` the workflows still run but skip the report (with a warning). The drill downloads artifacts
with the workflow's own token (`actions: read`); no extra token is needed. Scheduled workflows run from the default
branch, so the drill starts once this file is on `main`.

- `npm run db:indexes` creates or updates every index (idempotent; CI runs it on each deploy).
- TTL indexes expire sessions, nonces, draft rooms (24 h after the last move), and cached explorer data (7 days).
- No transactions: correctness relies on unique indexes and optimistic concurrency
  ([ADR 0002](adr/0002-mongodb-driver-strategy.md)).

## Secrets

Set as sensitive environment variables in Vercel (per environment) and as GitHub environment secrets; never in the
repo. Rotate a secret by setting the new value in Vercel (and GitHub if CI uses it) and redeploying the branch.
Rotating `CRON_SECRET` means updating it in Vercel and in the GitHub `production` environment (the backup and
restore-drill workflows report with it); rotating the MongoDB password needs `MONGODB_URI` updated in both places.

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
| No owner alerts arrive                                        | No admin device has notifications on, or VAPID keys aren't set          | Turn notifications on (Account), then **Send a test alert** on the admin page    |
| Playwright runs time out or the machine runs out of memory    | Two E2E suites (dev servers) at once                                    | Run one suite at a time, with `--workers=2`                                      |
| `Type '"/route"' does not satisfy the constraint 'AppRoutes'` | Route types are stale                                                   | `npx next typegen`                                                               |
