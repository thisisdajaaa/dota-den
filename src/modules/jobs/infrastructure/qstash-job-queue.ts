import type { Client } from "@upstash/qstash";
import type { EnqueueOptions, EnqueueResult, JobQueue } from "../jobs.ports";
import type { JobName } from "../domain/job";

/**
 * QStash refuses deduplication ids with characters like ":" (400 "DeduplicationId cannot
 * contain ':'"), which failed every match backfill and cron job that set a dedup key. Anything
 * outside letters, digits, "-" and "_" is written as "_<hex>", so distinct keys stay distinct.
 */
export function qstashDedupId(name: string, key: string): string {
  return `${name}--${key}`.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`);
}

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
      ...(opts.dedupKey ? { deduplicationId: qstashDedupId(name, opts.dedupKey) } : {}),
    });
    return "queued";
  }
}
