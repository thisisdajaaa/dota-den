import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/common/cache/redis", () => ({ getRedis: () => null }));
vi.mock("@/common/config/env", () => ({ env: () => ({ APP_URL: "http://localhost:3000" }) }));
vi.mock("@/modules/identity", async () => {
  const { UnauthorizedError } = await import("@/common/errors/app-error");
  return {
    requireUser: async (req: NextRequest) => {
      const id = req.cookies.get("session")?.value;
      if (!id) throw new UnauthorizedError();
      return { id, accountId32: 1 };
    },
  };
});

const { MmrController } = await import("@/modules/mmr/mmr.controller");
const { MAX_SCREENSHOT_BYTES } = await import("@/modules/mmr/domain/screenshot-read");

const ORIGIN = "http://localhost:3000";

function setup() {
  const journal = {
    delete: vi.fn(async () => ({ ok: false })),
  };
  const screenshots = { available: true, read: vi.fn() };
  const controller = new MmrController({
    journal: journal as never,
    screenshots: screenshots as never,
  });
  return { controller, journal, screenshots };
}

describe("MmrController", () => {
  it("rate-limits deleting entries per user (30 a minute)", async () => {
    const { controller } = setup();
    const del = () =>
      controller.remove(
        new NextRequest(`${ORIGIN}/api/v1/mmr-entries/x`, {
          method: "DELETE",
          headers: { origin: ORIGIN, cookie: "session=rate-limited-user" },
        }),
        { params: Promise.resolve({ id: "x" }) },
      );
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await del()).status);
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("refuses an oversized screenshot upload before reading the body", async () => {
    const { controller, screenshots } = setup();
    const req = new NextRequest(`${ORIGIN}/api/v1/mmr-entries/read-screenshot`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        cookie: "session=u1",
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(MAX_SCREENSHOT_BYTES * 2),
      },
      body: "--x--",
    });
    const formData = vi.spyOn(req, "formData");
    const res = await controller.readScreenshot(req);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/too large/);
    expect(formData).not.toHaveBeenCalled();
    expect(screenshots.read).not.toHaveBeenCalled();
  });
});
