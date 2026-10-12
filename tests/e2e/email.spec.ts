import { expect, test, type APIRequestContext } from "@playwright/test";

// Each test has its own identity, so addresses saved here stay out of other specs.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960458881";
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960458882";
const VALIDATION_LOGIN = "/api/v1/auth/steam/login?as=76561197960458883";
// The fake Resend API in the fixture server records every email "sent".
const FIXTURE = `http://localhost:${process.env.FIXTURE_PORT ?? 3101}`;

interface SentEmail {
  to: string[];
  from: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Waits for the next email to `to` beyond the `seen` already read. */
async function nextEmail(request: APIRequestContext, to: string, seen: number) {
  let found: SentEmail[] = [];
  await expect
    .poll(async () => {
      found = await (
        await request.get(`${FIXTURE}/resend/outbox?to=${encodeURIComponent(to)}`)
      ).json();
      return found.length;
    })
    .toBeGreaterThan(seen);
  return found[seen];
}

const linkIn = (email: SentEmail, path: string) => {
  const m = new RegExp(`(https?://[^\\s]+${path}\\?token=[^\\s]+)`).exec(email.text);
  expect(m, `a ${path} link in the email`).not.toBeNull();
  return m![1];
};

test("opt in, confirm by email, then unsubscribe signed-out", async ({ page, browser }) => {
  const address = `e2e-${Date.now()}@example.com`;
  await page.goto(LOGIN);
  await page.goto("/account");
  const card = page.getByRole("region", { name: "Weekly email" });
  await card.getByLabel("Email address").fill(address);
  await card.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(card.getByRole("status")).toContainText(`Waiting for you to confirm ${address}`);

  const confirmation = await nextEmail(page.request, address, 0);
  expect(confirmation.from).toBe("Dota Den <digest@e2e.example>");
  expect(confirmation.subject).toBe("Confirm your Dota Den weekly email");
  expect(confirmation.html).toContain("<!doctype html>");
  // Only a confirmed address gets anything else: no unsubscribe header on this one.
  expect(confirmation.headers).toBeUndefined();

  // Opening the link does nothing until the button is pressed (mail scanners open links too).
  await page.goto(linkIn(confirmation, "/email/confirm"));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Confirmed.");

  await page.goto("/account");
  await expect(card.getByRole("status")).toContainText(
    `On. The weekly email goes to ${address} on Mondays.`,
  );

  // The data export has the address, without the link secrets.
  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.emailSubscription).toEqual([
    expect.objectContaining({ email: address, status: "confirmed" }),
  ]);
  expect(exported.emailSubscription[0]).not.toHaveProperty("unsubscribeNonce");
  expect(exported.emailSubscription[0]).not.toHaveProperty("confirmTokenHash");

  await card.getByRole("button", { name: "Send a test email" }).click();
  const sample = await nextEmail(page.request, address, 1);
  expect(sample.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  expect(sample.headers?.["List-Unsubscribe"]).toMatch(
    /^<http.+\/api\/v1\/email\/unsubscribe\?token=.+>$/,
  );
  const unsubscribe = linkIn(sample, "/email/unsubscribe");

  // Signed-out, in another browser: the link alone is enough.
  const stranger = await browser.newContext();
  const other = await stranger.newPage();
  await other.goto(unsubscribe);
  await other.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(other.getByRole("status")).toContainText("You're unsubscribed.");
  await stranger.close();

  await page.goto("/account");
  await expect(card.getByRole("status")).toContainText(`You unsubscribed ${address}.`);
  // No consent, no email.
  const test = await page.request.post("/api/v1/me/email/test", {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(test.status()).toBe(409);

  // Stop and delete forgets the address.
  await card.getByRole("button", { name: "Stop and delete my address" }).click();
  await expect(card.getByLabel("Email address")).toHaveValue("");
  const after = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(after.emailSubscription).toEqual([]);
});

test("one-click unsubscribe (RFC 8058) works without a session or origin", async ({
  page,
  playwright,
  baseURL,
}) => {
  const address = `e2e-oneclick-${Date.now()}@example.com`;
  const headers = { origin: new URL(baseURL!).origin };
  await page.goto(API_LOGIN);
  const saved = await page.request.put("/api/v1/me/email", { data: { email: address }, headers });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).data).toEqual({ enabled: true, email: address, status: "pending" });

  const confirmation = await nextEmail(page.request, address, 0);
  const token = new URL(linkIn(confirmation, "/email/confirm")).searchParams.get("token")!;
  const confirmed = await page.request.post(
    `/api/v1/email/confirm?token=${encodeURIComponent(token)}`,
    { headers },
  );
  expect((await confirmed.json()).data).toEqual({ outcome: "confirmed" });
  // Single use.
  const again = await page.request.post(
    `/api/v1/email/confirm?token=${encodeURIComponent(token)}`,
    {
      headers,
    },
  );
  expect((await again.json()).data).toEqual({ outcome: "invalid" });

  expect((await page.request.post("/api/v1/me/email/test", { headers })).status()).toBe(200);
  const sample = await nextEmail(page.request, address, 1);
  const oneClick = /^<(.+)>$/.exec(sample.headers!["List-Unsubscribe"])![1];

  // What a mail app's server sends: no cookies, no Origin.
  const mailApp = await playwright.request.newContext();
  const res = await mailApp.post(oneClick, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).data).toEqual({ outcome: "unsubscribed" });
  // A forged token does nothing.
  const forged = await mailApp.post(oneClick.replace(/token=u1\.[^.]+/, "token=u1.Zm9yZ2Vk"));
  expect((await forged.json()).data).toEqual({ outcome: "invalid" });
  await mailApp.dispose();
  const status = await (await page.request.get("/account")).text();
  expect(status).toContain(`You unsubscribed ${address}.`);
});

test("email settings need a session, the same origin and a valid address", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const put = (data: unknown, headers: Record<string, string> = { origin }) =>
    request.put("/api/v1/me/email", { data, headers });
  expect((await put({ email: "a@example.com" }, {})).status()).toBe(403);
  expect((await put({ email: "a@example.com" })).status()).toBe(401);
  await request.get(VALIDATION_LOGIN);
  expect((await put({ email: "not an address" })).status()).toBe(400);
  expect((await put({ email: "a@example.com\r\nBcc: b@example.com" })).status()).toBe(400);
  expect((await put({ email: "a@example.com", extra: true })).status()).toBe(400);
  // Confirming needs the page's own origin; a bad token is just invalid.
  expect((await request.post("/api/v1/email/confirm?token=c1.nope.nope")).status()).toBe(403);
  const bad = await request.post("/api/v1/email/confirm?token=c1.nope.nope", {
    headers: { origin },
  });
  expect((await bad.json()).data).toEqual({ outcome: "invalid" });
  // Signed-out pages explain a missing token.
  const page = await request.get("/email/unsubscribe");
  expect(await page.text()).toContain("This link is incomplete");
});
