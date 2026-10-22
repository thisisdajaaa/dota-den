import "server-only";
import { after } from "next/server";
import { logger } from "@/common/logging/logger";

/**
 * Runs `task` once the response has been sent (Next's `after()`). Nobody is waiting on it,
 * so a failure is logged as `after_task_failed` (warn) with the task's name and `context`
 * instead of surfacing as an unhandled error. Throws, like `after()`, outside a request.
 */
export function afterResponse(
  task: string,
  /** The work, or a promise already running (it's awaited so its failure is logged). */
  run: (() => unknown) | Promise<unknown>,
  context: Record<string, unknown> = {},
): void {
  after(async () => {
    try {
      await (typeof run === "function" ? run() : run);
    } catch (error) {
      logger.warn("after_task_failed", { task, ...context, error });
    }
  });
}
