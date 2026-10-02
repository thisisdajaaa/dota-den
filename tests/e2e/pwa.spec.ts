import { expect, test } from "@playwright/test";

test("the app can be installed: manifest, icons, service worker and offline page", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0605");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /\/icons\/apple-touch-icon\.png/,
  );

  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({
    name: "Dota Den",
    display: "standalone",
    start_url: "/dashboard",
  });
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain("offline.html");
  expect(await (await request.get("/offline.html")).text()).toContain("You're offline");
});
