import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_RESEND_WEBHOOK_SECRET, svixHeaders } from "./support/resend-webhook";

// Each test has its own identity, so addresses saved here stay out of other specs.
const BOUNCE_LOGIN = "/api/v1/auth/steam/login?as=76561197960461241";
const COMPLAINT_LOGIN = "/api/v1/auth/steam/login?as=76561197960461242";
const UNSIGNED_LOGIN = "/api/v1/auth/steam/login?as=76561197960461243";
const FIXTURE = `http://localhost:${process.env.FIXTURE_PORT ?? 3101}`;
const WEBHOOK = "/api/v1/email/webhook";

/** Saves an address and confirms it through the link in the (fake) confirmation email. */
async function confirmedAddress(page: Page, login: string, address: string) {
  await page.goto(login);
  const headers = { origin: new URL(page.url()).origin };
  const saved = await page.request.put("/api/v1/me/email", { data: { email: address }, headers });
  expect(saved.status()).toBe(200);
  let text = "";
  await expect
    .poll(async () => {
      const sent = await (
        await page.request.get(`${FIXTURE}/resend/outbox?to=${encodeURIComponent(address)}`)
      ).json();
      text = sent[0]?.text ?? "";
      return sent.length;
    })
    .toBeGreaterThan(0);
  const token = /\/email\/confirm\?token=([^\s]+)/.exec(text)![1];
  const confirmed = await page.request.post(`/api/v1/email/confirm?token=${token}`, { headers });
  expect((await confirmed.json()).data).toEqual({ outcome: "confirmed" });
  return headers;
}

/** What Resend's servers send: no cookies, no Origin, just the signed event. */
async function postEvent(
  request: APIRequestContext,
  event: unknown,
  opts: Parameters<typeof svixHeaders>[1] = {},
) {
  const body = JSON.stringify(event);
  return request.post(WEBHOOK, { data: body, headers: svixHeaders(body, opts) });
}

test("a hard bounce stops the weekly email and the Account page says so", async ({
  page,
  playwright,
}) => {
  const address = `e2e-bounce-${Date.now()}@example.com`;
  const headers = await confirmedAddress(page, BOUNCE_LOGIN, address);

  const resend = await playwright.request.newContext();
  const event = {
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "re_fixture_bounce",
      from: "Dota Den <digest@e2e.example>",
      to: [address.toUpperCase()],
      subject: "Your Dota week",
      bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" },
    },
  };
  const id = `msg_e2e_bounce_${Date.now()}`;
  const res = await postEvent(resend, event, { id });
  expect(res.status()).toBe(200);
  expect((await res.json()).data).toEqual({ outcome: "processed", stopped: 1 });
  // Resend retries with the same id: handled once.
  const retry = await postEvent(resend, event, { id });
  expect((await retry.json()).data).toEqual({ outcome: "duplicate" });
  await resend.dispose();

  await page.goto("/account");
  const card = page.getByRole("region", { name: "Weekly email" });
  await expect(card.getByRole("status")).toContainText(
    `We couldn't deliver to this address (${address})`,
  );
  // Nothing more goes to it, not even a test email.
  expect((await page.request.post("/api/v1/me/email/test", { headers })).status()).toBe(409);

  // The player can enter an address again (which restarts the double opt-in; a new
  // confirmation email is rate-limited to one a minute, so that part is unit-tested).
  await card.getByRole("button", { name: "Enter an address again" }).click();
  await expect(card.getByLabel("Email address")).toHaveValue("");
  await expect(card.getByRole("button", { name: "Send confirmation link" })).toBeVisible();
});

test("a spam complaint stops the weekly email", async ({ page, playwright }) => {
  const address = `e2e-complaint-${Date.now()}@example.com`;
  await confirmedAddress(page, COMPLAINT_LOGIN, address);

  const resend = await playwright.request.newContext();
  const res = await postEvent(resend, { type: "email.complained", data: { to: [address] } });
  expect((await res.json()).data).toEqual({ outcome: "processed", stopped: 1 });
  await resend.dispose();

  await page.goto("/account");
  await expect(
    page.getByRole("region", { name: "Weekly email" }).getByRole("status"),
  ).toContainText("You marked the email as spam, so we stopped sending");
});

test("webhook requests without a valid signature are rejected", async ({ page, playwright }) => {
  const address = `e2e-unsigned-${Date.now()}@example.com`;
  await confirmedAddress(page, UNSIGNED_LOGIN, address);
  const event = { type: "email.bounced", data: { to: [address] } };
  const body = JSON.stringify(event);
  const resend = await playwright.request.newContext();

  // No signature at all.
  const unsigned = await resend.post(WEBHOOK, {
    data: body,
    headers: { "content-type": "application/json" },
  });
  expect(unsigned.status()).toBe(401);
  // Signed with another secret.
  const otherSecret = `whsec_${Buffer.from("not-the-e2e-webhook-secret-00001").toString("base64")}`;
  expect(otherSecret).not.toBe(E2E_RESEND_WEBHOOK_SECRET);
  expect((await postEvent(resend, event, { secret: otherSecret })).status()).toBe(401);
  // A correctly signed body, then changed.
  const tampered = await resend.post(WEBHOOK, {
    data: body.replace("bounced", "complained"),
    headers: svixHeaders(body),
  });
  expect(tampered.status()).toBe(401);
  // An old (replayed) request.
  const old = new Date(Date.now() - 10 * 60_000);
  expect((await postEvent(resend, event, { at: old })).status()).toBe(401);
  await resend.dispose();

  await page.goto("/account");
  await expect(
    page.getByRole("region", { name: "Weekly email" }).getByRole("status"),
  ).toContainText(`On. The weekly email goes to ${address} on Mondays.`);
});
