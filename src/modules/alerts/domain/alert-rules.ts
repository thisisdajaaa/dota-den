/**
 * Owner alerts (pure rules): when something the owner must fix has gone wrong (a daily job
 * failed or stopped running, OpenDota is down, a backup or restore drill failed, a Plus
 * payment was refunded), and how
 * often the same problem may be raised.
 */

export const ALERT_KINDS = [
  "cron_failed",
  "match_sync_failures",
  "patch_import",
  "cron_stale",
  "opendota_down",
  "backup_failed",
  "plus_refund",
  "test",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** One problem to raise. `key` identifies it for throttling; `vars` fill the message. */
export interface Alert {
  kind: AlertKind;
  key: string;
  vars: Record<string, string | number>;
}

/** The same alert (same key) is sent at most once in this window. */
export const ALERT_THROTTLE_MS = 6 * 3_600_000;
/** A daily job that hasn't completed within this long has stopped running. */
export const CRON_STALE_MS = 26 * 3_600_000;
/** The daily jobs (Vercel Cron) that each watch the other. */
export const WATCHED_CRONS = ["patches", "matches"] as const;
/** The match sync alerts when more than this share of the accounts it tried failed... */
export const MATCH_FAILURE_SHARE = 0.2;
/** ...and at least this many did (one private profile isn't news). */
export const MATCH_FAILURE_MIN = 2;
/** OpenDota counts as down when at least this share of tried accounts failed upstream. */
export const OPENDOTA_FAILURE_SHARE = 0.5;
/** OpenDota must look down this long (two checks this far apart) before an alert. */
export const OPENDOTA_SUSTAINED_MS = 25 * 60_000;
/** Observations further apart than this start a new episode (it may have recovered between). */
export const OPENDOTA_EPISODE_GAP_MS = 2 * 3_600_000;

/** What a finished cron run recorded (cron_runs). */
export interface CronResult {
  ok: boolean;
  summary: Record<string, unknown>;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : fallback;

/** Accounts the match sync really tried, and how many failed (and of those, upstream). */
export function matchSyncCounts(summary: Record<string, unknown>): {
  attempted: number;
  failed: number;
  upstream: number;
} {
  const failed = Array.isArray(summary.failed) ? (summary.failed as unknown[]) : [];
  const attempted = Math.max(0, num(summary.accounts) - num(summary.skipped));
  const upstream = failed.filter(
    (f) =>
      typeof f === "object" && f !== null && (f as { outcome?: unknown }).outcome === "provider",
  ).length;
  return { attempted, failed: failed.length, upstream };
}

/** The alerts one finished cron run calls for. */
export function cronRunAlerts(name: string, result: CronResult): Alert[] {
  const { summary } = result;
  if (name === "patches" && num(summary.failed) > 0) {
    // Some patches couldn't be parsed: the import is degraded (spec §10).
    return [
      {
        kind: "patch_import",
        key: "patch_import",
        vars: { failed: num(summary.failed), imported: num(summary.imported) },
      },
    ];
  }
  if (!result.ok) {
    return [
      {
        kind: "cron_failed",
        key: `cron_failed:${name}`,
        vars: { cron: name, error: text(summary.error, "unknown") },
      },
    ];
  }
  if (name === "matches") {
    const { attempted, failed } = matchSyncCounts(summary);
    if (attempted > 0 && failed >= MATCH_FAILURE_MIN && failed / attempted > MATCH_FAILURE_SHARE) {
      return [
        {
          kind: "match_sync_failures",
          key: "match_sync_failures",
          vars: { failed, accounts: attempted, percent: Math.round((failed / attempted) * 100) },
        },
      ];
    }
  }
  return [];
}

/** When each watched cron last completed (cron-triggered runs only). */
export interface CronFreshness {
  /** Last run that finished ok, per cron name. */
  lastOkAt: ReadonlyMap<string, Date>;
  /** The oldest recorded cron run of any job: before it, nothing was running yet. */
  firstRunAt: Date | null;
}

/**
 * Crons that haven't completed within CRON_STALE_MS. A job that never completed counts from
 * the first recorded cron run, so a fresh install (no runs at all) raises nothing.
 */
export function staleCronAlerts(
  freshness: CronFreshness,
  now: Date,
  names: readonly string[] = WATCHED_CRONS,
): Alert[] {
  if (!freshness.firstRunAt) return [];
  return names.flatMap((name) => {
    const since = freshness.lastOkAt.get(name) ?? freshness.firstRunAt!;
    const age = now.getTime() - since.getTime();
    if (age <= CRON_STALE_MS) return [];
    return [
      {
        kind: "cron_stale" as const,
        key: `cron_stale:${name}`,
        vars: { cron: name, hours: Math.floor(age / 3_600_000) },
      },
    ];
  });
}

/** How the OpenDota gateway looked to this server instance. */
export interface UpstreamHealth {
  circuitOpen: boolean;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

export type UpstreamObservation = "down" | "up" | "unknown";

/**
 * Does OpenDota look down right now? Down: the circuit breaker is open, the latest call
 * failed, or most accounts the match sync tried failed upstream. Up: the latest call
 * succeeded (and nothing says down). Unknown: no calls to judge by.
 */
export function observeOpenDota(input: {
  health: UpstreamHealth | null;
  matchRun?: { attempted: number; upstream: number } | null;
}): UpstreamObservation {
  const { health, matchRun } = input;
  if (
    matchRun &&
    matchRun.attempted > 0 &&
    matchRun.upstream / matchRun.attempted >= OPENDOTA_FAILURE_SHARE
  )
    return "down";
  if (health?.circuitOpen) return "down";
  const success = health?.lastSuccessAt ?? null;
  const failure = health?.lastFailureAt ?? null;
  if (failure !== null && (success === null || failure > success)) return "down";
  if (success !== null) return "up";
  if (matchRun && matchRun.attempted > 0 && matchRun.upstream === 0) return "up";
  return "unknown";
}

/** Saved between checks: since when OpenDota has looked down, and when it last did. */
export interface DownState {
  downSince: Date;
  lastDownAt: Date;
}

/**
 * The next saved state and whether to alert. Down twice, at least OPENDOTA_SUSTAINED_MS apart
 * and within one episode, raises an alert; up clears it; unknown keeps it.
 */
export function nextDownState(
  prev: DownState | null,
  observation: UpstreamObservation,
  now: Date,
): { state: DownState | null; alert: Alert | null } {
  if (observation === "unknown") return { state: prev, alert: null };
  if (observation === "up") return { state: null, alert: null };
  const continues = prev && now.getTime() - prev.lastDownAt.getTime() <= OPENDOTA_EPISODE_GAP_MS;
  const downSince = continues ? prev.downSince : now;
  const state = { downSince, lastDownAt: now };
  const minutes = Math.floor((now.getTime() - downSince.getTime()) / 60_000);
  const alert =
    now.getTime() - downSince.getTime() >= OPENDOTA_SUSTAINED_MS
      ? { kind: "opendota_down" as const, key: "opendota_down", vars: { minutes } }
      : null;
  return { state, alert };
}

/** Jobs that report to /api/cron/backup-report (GitHub Actions workflows). */
export const OPS_JOBS = ["backup", "restore-drill"] as const;
export type OpsJob = (typeof OPS_JOBS)[number];

/** A failed backup or restore drill. */
export function opsReportAlert(report: {
  job: OpsJob;
  ok: boolean;
  details: string;
}): Alert | null {
  if (report.ok) return null;
  return {
    kind: "backup_failed",
    key: `ops_failed:${report.job}`,
    vars: { job: report.job, details: text(report.details, "no details") },
  };
}
