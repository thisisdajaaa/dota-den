import { describe, expect, it } from "vitest";
import { heroThumb } from "@/modules/matches/ui/hero-image";

const STEAM = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

describe("heroThumb", () => {
  it("serves a resized copy at twice the shown width, from the allowed sizes", () => {
    expect(heroThumb(`${STEAM}/antimage.png`, 43)).toBe("/img/hero/antimage-96.webp");
    expect(heroThumb(`${STEAM}/antimage.png?v=1`, 57)).toBe("/img/hero/antimage-128.webp");
    expect(heroThumb(`${STEAM}/pudge.png`, 100)).toBe("/img/hero/pudge-200.webp");
    // Wider than the largest size: the largest.
    expect(heroThumb(`${STEAM}/pudge.png`, 400)).toBe("/img/hero/pudge-300.webp");
  });

  it("leaves anything that isn't a Steam hero portrait alone", () => {
    expect(heroThumb("https://example.com/x.png", 60)).toBe("https://example.com/x.png");
    expect(heroThumb(`${STEAM}/icons/antimage.png`, 60)).toBe(`${STEAM}/icons/antimage.png`);
  });
});
