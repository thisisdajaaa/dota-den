import { describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError, ValidationError } from "@/common/errors/app-error";
import { loadWindow } from "@/modules/mmr/domain/load-window";
import { ScreenshotService } from "@/modules/mmr/services/screenshot.service";

const png = (size = 10) => ({ type: "image/png", size, bytes: async () => new ArrayBuffer(4) });

describe("ScreenshotService", () => {
  it("checks the file before asking the reader", async () => {
    const read = vi.fn(async () => ({ mmr: 4100, seen: "profile" }));
    const svc = new ScreenshotService({ reader: { read }, logger: { warn: () => {} } });
    await expect(svc.read({ ...png(), type: "image/gif" })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.read(png(50 * 1024 * 1024))).rejects.toBeInstanceOf(ValidationError);
    expect(read).not.toHaveBeenCalled();
    expect(await svc.read(png())).toEqual({ mmr: 4100, seen: "profile" });
  });

  it("reports the reader as unavailable when off or failing", async () => {
    const off = new ScreenshotService({ reader: null, logger: { warn: () => {} } });
    expect(off.available).toBe(false);
    await expect(off.read(png())).rejects.toBeInstanceOf(UpstreamUnavailableError);
    const failing = new ScreenshotService({
      reader: { read: async () => Promise.reject(new Error("timeout")) },
      logger: { warn: () => {} },
    });
    await expect(failing.read(png())).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("loadWindow", () => {
  const at = (iso: string) => ({ observedAt: new Date(iso) });
  const now = new Date("2026-10-06T12:00:00Z");

  it("reaches out to the MMR entries either side of the period", () => {
    const w = loadWindow(
      [at("2026-09-20T10:00:00Z"), at("2026-10-01T10:00:00Z"), at("2026-10-20T10:00:00Z")],
      { from: "2026-09-28", to: "2026-10-04" },
      now,
    );
    expect(w).toEqual({
      from: new Date("2026-09-20T10:00:00Z"),
      to: new Date("2026-10-20T10:00:00Z"),
    });
  });

  it("pads by a time zone's width without entries, and never past now", () => {
    const w = loadWindow([], { from: "2026-10-05", to: "2026-10-11" }, now);
    expect(w.from).toEqual(new Date("2026-10-04T09:00:00Z"));
    expect(w.to).toEqual(now);
  });
});
