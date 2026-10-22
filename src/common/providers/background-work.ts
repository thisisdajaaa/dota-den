import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Which budget lane the work running in this async context bills its upstream calls to. */
const marked = new AsyncLocalStorage<"member" | "guest">();

/**
 * Runs `fn` as trusted background work (a verified QStash job, an authenticated cron run).
 * Its upstream calls count against the member budget even though the request carries no
 * sign-in cookie. Set only after the caller is verified, so visitors can't claim it.
 */
export function asBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return marked.run("member", fn);
}

/**
 * Runs `fn` as guest traffic whoever asks: for responses mostly fetched by crawlers and
 * link-preview bots (preview images), whose upstream calls must stay in the guest share.
 */
export function asGuestWork<T>(fn: () => Promise<T>): Promise<T> {
  return marked.run("guest", fn);
}

/** Whether the current call is part of trusted background work. */
export function isBackgroundWork(): boolean {
  return marked.getStore() === "member";
}

/** The lane this async context was marked with, if any. */
export function markedLane(): "member" | "guest" | undefined {
  return marked.getStore();
}
