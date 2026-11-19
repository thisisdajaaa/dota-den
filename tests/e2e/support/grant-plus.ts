import { expect, type Page } from "@playwright/test";
import { lemonSqueezyHeaders, subscriptionEvent } from "./plus-webhook";

/** Plus for the signed-in player through a signed (fake) Lemon Squeezy webhook. */
export async function grantPlus(page: Page, tag = "e2e") {
  const origin = new URL(page.url()).origin;
  const res = await page.request.post("/api/v1/plus/checkout", {
    data: { plan: "monthly" },
    headers: { origin },
  });
  expect(res.status()).toBe(200);
  const userId = new URL((await res.json()).data.url).searchParams.get(
    "checkout[custom][user_id]",
  )!;
  const body = subscriptionEvent({
    event: "subscription_created",
    subscriptionId: `${tag}-${userId}`,
    userId,
    status: "active",
    updatedAt: new Date(),
    renewsAt: new Date(Date.now() + 30 * 86_400_000),
  });
  const hook = await page.request.post("/api/v1/plus/webhook", {
    data: body,
    headers: lemonSqueezyHeaders(body, "subscription_created"),
  });
  expect(hook.status()).toBe(200);
}
