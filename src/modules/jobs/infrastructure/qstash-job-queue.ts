import type { Client } from "@upstash/qstash";
import type { EnqueueOptions, EnqueueResult, JobQueue } from "../jobs.ports";
import type { JobName } from "../domain/job";

/** Durable jobs through Upstash QStash: POSTed to `${appUrl}/api/jobs/<name>` with retries. */
export class QStashJobQueue implements JobQueue {
  readonly durable = true;

  constructor(
    private readonly client: Pick<Client, "publishJSON">,
    private readonly opts: { appUrl: string; retries?: number; headers?: Record<string, string> },
  ) {}

  async enqueue(
    name: JobName,
    payload: Record<string, unknown>,
    opts: EnqueueOptions = {},
  ): Promise<EnqueueResult> {
    await this.client.publishJSON({
      url: `${this.opts.appUrl.replace(/\/$/, "")}/api/jobs/${name}`,
      body: { payload, dedupKey: opts.dedupKey ?? null },
      retries: this.opts.retries ?? 3,
      ...(this.opts.headers ? { headers: this.opts.headers } : {}),
      ...(opts.delaySec ? { delay: opts.delaySec } : {}),
      // QStash drops a repeat of the same id; our job_runs record is the second guard.
      ...(opts.dedupKey ? { deduplicationId: `${name}:${opts.dedupKey}` } : {}),
    });
    return "queued";
  }
}
