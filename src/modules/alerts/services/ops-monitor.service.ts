import type { Logger } from "@/common/logging/logger";
import {
  cronRunAlerts,
  matchSyncCounts,
  nextDownState,
  observeOpenDota,
  opsReportAlert,
  staleCronAlerts,
  WATCHED_CRONS,
  type Alert,
  type CronResult,
  type OpsJob,
} from "../domain/alert-rules";
import type { OpsReport } from "../alerts.model";
import type {
  AlertStatePort,
  CronHistoryPort,
  OpsReportsPort,
  UpstreamHealthPort,
} from "../alerts.ports";
import type { OpsReportResultDto } from "../dtos/responses/ops-report.dto";
import type { OwnerAlertsService } from "./owner-alerts.service";

const OPENDOTA = "opendota";

/**
 * Watches the app's own operations and raises owner alerts: daily jobs that failed or stopped
 * running, OpenDota being down for a while, and failed backups or restore drills.
 * Checks never throw: a monitoring hiccup must not fail the job it watches.
 */
export class OpsMonitorService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      alerts: Pick<OwnerAlertsService, "raise">;
      crons: CronHistoryPort;
      upstream: UpstreamHealthPort;
      state: AlertStatePort;
      reports: OpsReportsPort;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * After every daily job run: alerts for this run, then the lightweight checks (has every
   * daily job completed lately? does OpenDota look down?). Returns what was raised.
   */
  async cronFinished(name: string, result: CronResult): Promise<Alert[]> {
    return this.guard("cron_finished", async () => {
      const alerts = [...cronRunAlerts(name, result), ...(await this.staleCrons())];
      const matchRun = name === "matches" && result.ok ? matchSyncCounts(result.summary) : null;
      const down = await this.openDota(matchRun);
      if (down) alerts.push(down);
      return this.raiseAll(alerts);
    });
  }

  /** Has every daily job completed within 26 hours? (Also run by the backup report.) */
  async checkCrons(): Promise<Alert[]> {
    return this.guard("check_crons", async () => this.raiseAll(await this.staleCrons()));
  }

  /** A backup or restore-drill workflow reports its outcome. */
  async recordReport(report: {
    job: OpsJob;
    ok: boolean;
    details: string;
    runUrl: string | null;
  }): Promise<OpsReportResultDto> {
    await this.deps.reports.insert({ ...report, at: this.now() });
    const alert = opsReportAlert(report);
    const raised = alert ? await this.guard("ops_report", () => this.raiseAll([alert])) : [];
    // The nightly backup doubles as an outside watchdog for the daily jobs.
    await this.checkCrons();
    return { recorded: true, alerted: raised.length > 0 };
  }

  recentReports(limit = 10): Promise<OpsReport[]> {
    return this.deps.reports.recent(limit);
  }

  private async staleCrons(): Promise<Alert[]> {
    return staleCronAlerts(await this.deps.crons.freshness(WATCHED_CRONS), this.now());
  }

  /** Updates the saved OpenDota state; returns an alert once it has been down long enough. */
  private async openDota(matchRun: { attempted: number; upstream: number } | null) {
    const observation = observeOpenDota({ health: this.deps.upstream.openDota(), matchRun });
    if (observation === "unknown") return null;
    const prev = await this.deps.state.get(OPENDOTA);
    const { state, alert } = nextDownState(prev, observation, this.now());
    if (state !== prev) await this.deps.state.set(OPENDOTA, state);
    return alert;
  }

  /** Raises each alert (throttled); returns the ones that went out. */
  private async raiseAll(alerts: Alert[]): Promise<Alert[]> {
    const sent: Alert[] = [];
    for (const alert of alerts) {
      if (await this.deps.alerts.raise(alert)) sent.push(alert);
    }
    return sent;
  }

  private async guard(op: string, task: () => Promise<Alert[]>): Promise<Alert[]> {
    try {
      return await task();
    } catch (error) {
      this.deps.logger.warn("ops_monitor_failed", { op, error });
      return [];
    }
  }
}
