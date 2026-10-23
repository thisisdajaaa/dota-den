import type { Logger } from "@/common/logging/logger";
import type { Result } from "@/common/result";
import {
  AUTO_PARSE_DEDUP_MS,
  AUTO_PARSE_MAX_AGE_MS,
  AUTO_PARSE_PER_SYNC,
} from "../domain/sync-policy";
import type { ProviderError } from "../domain/read-models";
import type { ParseRequestsPort } from "../matches.ports";

export interface AutoParseRun {
  outcome: "not_plus" | "nothing" | "done" | "rate_limited" | "upstream_busy";
  requested: number;
}

/**
 * Plus auto parse requests (ADR 0014): after a supporter's sync imports new games, ask
 * OpenDota to parse their newest unparsed ones, so the AI coach and the laning card have
 * data. At most a few per sync, never the same match twice in a few days, inside the same
 * per-player parse rate limit as the button, and through the shared OpenDota budget.
 */
export class AutoParseService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      requests: ParseRequestsPort;
      provider: { requestParse(matchId: string): Promise<Result<true, ProviderError>> };
      isPlus: (userId: string) => Promise<boolean>;
      /** The parse button's per-player rate limit; true when one more request is allowed. */
      allow: (userId: string) => Promise<boolean>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
      perSync?: number;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async afterSync(user: { id: string; accountId32: number }): Promise<AutoParseRun> {
    if (!(await this.deps.isPlus(user.id).catch(() => false)))
      return { outcome: "not_plus", requested: 0 };
    const perSync = this.deps.perSync ?? AUTO_PARSE_PER_SYNC;
    const now = this.now();
    // A few extra candidates, since some were asked for already.
    const candidates = await this.deps.requests.recentUnparsed(
      user.accountId32,
      new Date(now.getTime() - AUTO_PARSE_MAX_AGE_MS),
      perSync * 3,
    );
    const run: AutoParseRun = { outcome: "nothing", requested: 0 };
    for (const matchId of candidates) {
      if (run.requested >= perSync) break;
      if (!(await this.deps.requests.claim(matchId, now, AUTO_PARSE_DEDUP_MS))) continue;
      if (!(await this.deps.allow(user.id))) {
        await this.deps.requests.release(matchId);
        run.outcome = "rate_limited";
        break;
      }
      const res = await this.deps.provider.requestParse(matchId);
      if (!res.ok) {
        // OpenDota is busy or our budget is spent: stop; the game is tried after a later sync.
        await this.deps.requests.release(matchId);
        run.outcome = "upstream_busy";
        break;
      }
      run.requested++;
      run.outcome = "done";
    }
    if (run.requested > 0 || run.outcome !== "nothing")
      this.deps.logger.info("auto_parse_requested", { accountId32: user.accountId32, ...run });
    return run;
  }
}
