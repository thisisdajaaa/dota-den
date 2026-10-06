import type { Logger } from "@/common/logging/logger";
import { isNoise, newErrorEvent, type ErrorSource } from "./domain/error-event";
import type { ErrorsRepositoryPort } from "./errors.ports";

export interface RecordErrorInput {
  source: ErrorSource;
  message: string;
  digest?: string | null;
  path?: string | null;
  route?: string | null;
  kind?: string | null;
  stack?: string | null;
}

/** Errors users hit, for the admin page. */
export class ErrorsService {
  constructor(
    private readonly deps: {
      repository: ErrorsRepositoryPort;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {}

  /** Records an error. Never throws: reporting must not cause errors. */
  async record(input: RecordErrorInput): Promise<void> {
    if (isNoise(input.message)) return;
    try {
      await this.deps.repository.insert(newErrorEvent({ ...input, at: this.now() }));
    } catch (e) {
      this.deps.logger.warn("error_record_failed", {
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  /** Distinct errors in the last `days` days. */
  recentGroups(days = 7, limit = 20) {
    return this.deps.repository.groupsSince(
      new Date(this.now().getTime() - days * 24 * 3_600_000),
      limit,
    );
  }

  private now() {
    return this.deps.now?.() ?? new Date();
  }
}
