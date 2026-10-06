import { describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@/modules/errors/domain/error-event";
import { ErrorsService } from "@/modules/errors/errors.service";

describe("ErrorsService", () => {
  const make = (insert: (e: ErrorEvent) => Promise<void>) => {
    const warn = vi.fn();
    const groupsSince = vi.fn(async () => []);
    const svc = new ErrorsService({
      repository: { insert, groupsSince },
      logger: { warn },
      now: () => new Date("2026-10-06T00:00:00Z"),
    });
    return { svc, warn, groupsSince };
  };

  it("records real errors, skips noise, and never throws", async () => {
    const saved: ErrorEvent[] = [];
    const { svc } = make(async (e) => void saved.push(e));
    await svc.record({ source: "client", message: "aborted" });
    await svc.record({ source: "client", message: "x is undefined", path: "/matches/123?q=1" });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ message: "x is undefined", path: "/matches/123" });

    const failing = make(async () => Promise.reject(new Error("db down")));
    await expect(
      failing.svc.record({ source: "server", message: "boom" }),
    ).resolves.toBeUndefined();
    expect(failing.warn).toHaveBeenCalledWith("error_record_failed", { reason: "db down" });
  });

  it("asks for groups since N days ago", async () => {
    const { svc, groupsSince } = make(async () => {});
    await svc.recentGroups(7);
    expect(groupsSince).toHaveBeenCalledWith(new Date("2026-09-29T00:00:00Z"), 20);
  });
});
