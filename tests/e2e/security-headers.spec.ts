import { expect, test } from "@playwright/test";

test("every response carries the security headers", async ({ request }) => {
  for (const path of ["/", "/api/health"]) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
  }
});

// The policy is report-only: this is how we know it would be safe to enforce.
test("the main public pages break none of the content security policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  for (const path of ["/", "/meta", "/guides", "/patches", "/draft", "/live"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(violations).toEqual([]);
});
