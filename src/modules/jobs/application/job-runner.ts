import type { JobName } from "../domain/job";
import type { JobHandler, JobRunRepository } from "./ports";

export type RunOutcome =
  { status: "succeeded" } | { status: "skipped" } | { status: "failed"; error: string };

/** Runs a job once per dedup key, recording the run. Failures are reported, not thrown. */
export class JobRunner {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      handlers: Record<JobName, JobHandler>;
      runs: JobRunRepository;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async run(
    name: JobName,
    payload: Record<string, unknown>,
    dedupKey: string | null,
  ): Promise<RunOutcome> {
    const start = await this.deps.runs.begin(name, dedupKey, this.now());
    if (start.status === "already_done") return { status: "skipped" };
    try {
      await this.deps.handlers[name](payload);
      await this.deps.runs.finish(start.runId, { ok: true }, this.now());
      return { status: "succeeded" };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.deps.runs.finish(start.runId, { ok: false, error }, this.now());
      return { status: "failed", error };
    }
  }
}
