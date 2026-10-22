import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const trusted = new AsyncLocalStorage<true>();

/**
 * Runs `fn` as trusted background work (a verified QStash job, an authenticated cron run).
 * Its upstream calls count against the member budget even though the request carries no
 * sign-in cookie. Set only after the caller is verified, so visitors can't claim it.
 */
export function asBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return trusted.run(true, fn);
}

/** Whether the current call is part of trusted background work. */
export function isBackgroundWork(): boolean {
  return trusted.getStore() === true;
}
