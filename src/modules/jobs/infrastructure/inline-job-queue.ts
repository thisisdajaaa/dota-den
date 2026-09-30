import type { EnqueueOptions, EnqueueResult, JobQueue } from "../application/ports";
import type { JobName } from "../domain/job";

/**
 * Without QStash: run the job in this instance after the response (Next's `after()`).
 * A serverless function can't wait for a delay, so delayed jobs are skipped and the work
 * happens the way it did before queues (e.g. the next sync continues a backfill).
 */
export class InlineJobQueue implements JobQueue {
  readonly durable = false;

  constructor(
    private readonly deps: {
      run: (
        name: JobName,
        payload: Record<string, unknown>,
        dedupKey: string | null,
      ) => Promise<unknown>;
      schedule: (task: () => Promise<void>) => void;
    },
  ) {}

  async enqueue(
    name: JobName,
    payload: Record<string, unknown>,
    opts: EnqueueOptions = {},
  ): Promise<EnqueueResult> {
    if (opts.delaySec) return "skipped";
    this.deps.schedule(async () => {
      await this.deps.run(name, payload, opts.dedupKey ?? null);
    });
    return "inline";
  }
}
