import { describe, expect, it, vi } from "vitest";

const scheduled = vi.hoisted(() => [] as Array<() => Promise<unknown>>);
vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown>) => scheduled.push(task),
}));
const warn = vi.hoisted(() => vi.fn());
vi.mock("@/common/logging/logger", () => ({ logger: { warn } }));
const { afterResponse } = await import("@/common/http/after-response");

describe("afterResponse", () => {
  it("logs a failed task with its context instead of throwing", async () => {
    const error = new Error("db down");
    afterResponse(
      "record_visit",
      async () => {
        throw error;
      },
      { userId: "u1" },
    );
    await expect(scheduled.pop()!()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("after_task_failed", {
      task: "record_visit",
      userId: "u1",
      error,
    });
  });

  it("awaits a promise that's already running", async () => {
    warn.mockClear();
    afterResponse("draft_insights_refresh", Promise.reject(new Error("timeout")));
    await scheduled.pop()!();
    expect(warn).toHaveBeenCalledWith(
      "after_task_failed",
      expect.objectContaining({ task: "draft_insights_refresh" }),
    );
  });

  it("runs a task that succeeds without logging", async () => {
    warn.mockClear();
    const run = vi.fn(async () => "ok");
    afterResponse("patches_refresh", run);
    await scheduled.pop()!();
    expect(run).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });
});
