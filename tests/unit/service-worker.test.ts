import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Loads public/sw.js with a fake worker global and returns its event handlers. */
function loadWorker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: "https://dota-den.example" },
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    registration: { showNotification },
    clients: { matchAll: async () => [], openWindow, claim: async () => {} },
    skipWaiting: () => {},
  };
  runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), {
    self,
    URL,
    caches: {},
    fetch: () => {},
    Response: {},
    Promise,
  });
  const waitFor = async (handler: string, event: object) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[handler]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { waitFor, showNotification, openWindow };
}

async function openedFor(url: unknown): Promise<string> {
  const sw = loadWorker();
  await sw.waitFor("push", { data: { json: () => ({ title: "Hi", url }) } });
  const shown = sw.showNotification.mock.calls[0] as unknown as [string, { data: { url: string } }];
  await sw.waitFor("notificationclick", {
    notification: { close: () => {}, data: shown[1].data },
  });
  return (sw.openWindow.mock.calls[0] as unknown as [string])[0];
}

describe("service worker notification links", () => {
  it("opens a page of this site", async () => {
    expect(await openedFor("/matches/123?tab=laning")).toBe(
      "https://dota-den.example/matches/123?tab=laning",
    );
  });

  it.each([
    ["a protocol-relative URL", "//evil.example/phish"],
    ["a backslash URL", "/\\evil.example/phish"],
    ["an absolute URL", "https://evil.example/"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["no URL", undefined],
  ])("opens the dashboard instead of %s", async (_name, url) => {
    expect(await openedFor(url)).toBe("https://dota-den.example/dashboard");
  });
});
