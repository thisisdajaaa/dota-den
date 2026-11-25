/**
 * Signals from shared plumbing (provider gateways, AI call budgets) that the owner should hear
 * about: a daily budget nearly or fully spent, or the shared Redis store failing. Shared code
 * can't import the alerts feature, so it registers a sink at startup (src/instrumentation.ts).
 * Without a sink, signals are dropped. Emitting never throws and never waits.
 */
export type OpsSignal =
  | {
      kind: "budget";
      /** e.g. "opendota", "stratz", "llm:drafts". */
      budget: string;
      used: number;
      cap: number;
    }
  | { kind: "store_down"; store: "redis"; op: string };

type Sink = (signal: OpsSignal) => Promise<void>;

const globalForOps = globalThis as typeof globalThis & { __ddOpsSink?: Sink };

export function registerOpsSink(sink: Sink): void {
  globalForOps.__ddOpsSink = sink;
}

export function emitOpsSignal(signal: OpsSignal): void {
  const sink = globalForOps.__ddOpsSink;
  if (!sink) return;
  void sink(signal).catch(() => {
    // An alert that couldn't go out must not fail the call that noticed the problem.
  });
}

/** Daily budget milestones worth telling the owner about (50% is only logged). */
export const BUDGET_ALERT_SHARE = 0.8;
