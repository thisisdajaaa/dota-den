import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "./support/cron";

const REPORT = "/api/cron/backup-report";
const auth = { authorization: `Bearer ${E2E_CRON_SECRET}` };

test("backup and drill reports need the cron secret, are recorded and alert on failure", async ({
  request,
  page,
}) => {
  const failed = {
    job: "backup",
    ok: false,
    details: "Backup failure: dump failure, upload skipped.",
    runUrl: "https://github.com/thisisdajaaa/dota-den/actions/runs/1",
  };
  expect((await request.post(REPORT, { data: failed })).status()).toBe(401);
  expect(
    (
      await request.post(REPORT, { data: failed, headers: { authorization: "Bearer wrong" } })
    ).status(),
  ).toBe(401);
  expect(
    (await request.post(REPORT, { data: { job: "nightly", ok: false }, headers: auth })).status(),
  ).toBe(400);
  expect(
    (
      await request.post(REPORT, {
        data: { ...failed, runUrl: "https://evil.example/run" },
        headers: auth,
      })
    ).status(),
  ).toBe(400);

  const first = await request.post(REPORT, { data: failed, headers: auth });
  expect(first.status()).toBe(200);
  expect((await first.json()).data).toMatchObject({ recorded: true });
  // The same failure again within 6 hours is recorded, but not alerted twice.
  const again = await request.post(REPORT, { data: failed, headers: auth });
  expect((await again.json()).data).toEqual({ recorded: true, alerted: false });
  const drill = await request.post(REPORT, {
    data: { job: "restore-drill", ok: true, details: "users: 3, player_match_facts: 812" },
    headers: auth,
  });
  expect((await drill.json()).data).toEqual({ recorded: true, alerted: false });

  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/admin");
  const alerts = page.getByRole("region", { name: "Alerts" });
  await expect(alerts.getByText("backup failed", { exact: true })).toBeVisible();
  await expect(alerts).toContainText("Backup failure: dump failure, upload skipped.");
  await expect(alerts.getByText("Nightly backup", { exact: true }).first()).toBeVisible();
  await expect(alerts.getByText("Restore drill", { exact: true })).toBeVisible();
  await expect(alerts).toContainText("users: 3, player_match_facts: 812");
  await expect(alerts.getByRole("link", { name: "View run" }).first()).toHaveAttribute(
    "href",
    failed.runUrl,
  );
});

test("admins can send a test alert and see it listed", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/admin");
  const alerts = page.getByRole("region", { name: "Alerts" });
  const button = alerts.getByRole("button", { name: "Send a test alert" });
  // Right after navigation the button may not be hydrated yet: retry until it answers.
  await expect(async () => {
    await button.click();
    await expect(alerts.getByRole("status")).toContainText(/Sent/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  await expect(alerts.getByRole("status")).toContainText("Discord: not set up");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Alerts" }).getByText("Test alert", { exact: true }).first(),
  ).toBeVisible();
});
