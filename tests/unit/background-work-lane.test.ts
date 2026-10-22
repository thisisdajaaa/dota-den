import { describe, expect, it, vi } from "vitest";

// A request with no sign-in cookie (a guest page view, a QStash delivery, a cron run).
vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));

const { asBackgroundWork, isBackgroundWork } = await import("@/common/providers/background-work");
const { lane } = await import("@/common/providers/shared-gateway-options");

describe("OpenDota budget lane", () => {
  it("bills a cookie-less request as a guest", async () => {
    expect(await lane()).toBe("guest");
  });

  it("bills verified background work as a member, including work it awaits", async () => {
    await asBackgroundWork(async () => {
      expect(isBackgroundWork()).toBe(true);
      await Promise.resolve();
      expect(await lane()).toBe("member");
    });
    // The mark ends with the work.
    expect(isBackgroundWork()).toBe(false);
    expect(await lane()).toBe("guest");
  });
});
