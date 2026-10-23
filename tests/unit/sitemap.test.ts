import { describe, expect, it } from "vitest";
import { buildSitemap } from "@/common/utils/sitemap";

describe("buildSitemap", () => {
  const patches = [
    { version: "7.41", publishedAt: new Date("2026-09-01T00:00:00Z") },
    { version: "7.40c", publishedAt: new Date("2026-07-01T00:00:00Z") },
  ];

  it("lists the public pages, a guide per hero and a page per stored patch", () => {
    const urls = buildSitemap({
      baseUrl: "https://example.com/",
      heroIds: [14, 1, 14],
      patches,
    }).map((e) => e.url);
    expect(urls).toEqual([
      "https://example.com/",
      "https://example.com/meta",
      "https://example.com/guides",
      "https://example.com/patches",
      "https://example.com/draft",
      "https://example.com/draft/challenges",
      "https://example.com/live",
      "https://example.com/players",
      "https://example.com/privacy",
      "https://example.com/guides/1",
      "https://example.com/guides/14",
      "https://example.com/patches/7.41",
      "https://example.com/patches/7.40c",
    ]);
  });

  it("dates patch pages by release, and the patch index by the newest", () => {
    const entries = buildSitemap({ baseUrl: "https://example.com", heroIds: [], patches });
    expect(entries.find((e) => e.url.endsWith("/patches"))?.lastModified).toEqual(
      patches[0].publishedAt,
    );
    expect(entries.find((e) => e.url.endsWith("/patches/7.40c"))?.lastModified).toEqual(
      patches[1].publishedAt,
    );
  });

  it("still lists the public pages when the hero catalog and patches are unavailable", () => {
    expect(buildSitemap({ baseUrl: "https://example.com", heroIds: [], patches: [] })).toHaveLength(
      9,
    );
  });
});
