import { expect, test } from "@playwright/test";

test("robots.txt points to a sitemap of public pages, hero guides and patches", async ({
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Sitemap: http:\/\/localhost:\d+\/sitemap\.xml/);

  // The patch hub imports the fixture's patches on first visit; the sitemap lists stored ones.
  expect((await request.get("/patches")).ok()).toBe(true);
  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBe(true);
  const xml = await res.text();
  for (const path of ["/meta", "/guides", "/patches", "/draft", "/live", "/players"])
    expect(xml).toContain(`${path}</loc>`);
  // The fixture's hero catalog and stored patches.
  expect(xml).toMatch(/\/guides\/\d+<\/loc>/);
  expect(xml).toContain("/patches/7.41</loc>");
});
