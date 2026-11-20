import { describe, expect, it } from "vitest";
import { minimapAt, minimapFor } from "@/components/minimap";

describe("minimap art per patch", () => {
  it("picks the patch's map, letter patches included, else the latest", () => {
    expect(minimapFor("7.41")).toEqual({ src: "/maps/minimap-7.41.webp", patch: "7.41" });
    expect(minimapFor("7.41f").patch).toBe("7.41");
    expect(minimapFor("7.42").src).toBe("/maps/minimap-7.42.webp");
    expect(minimapFor(null).patch).toBe("7.42");
    expect(minimapFor("7.38").patch).toBe("7.42");
  });

  it("dates a game to the map it was played on, none before 7.41", () => {
    expect(minimapAt(new Date("2026-11-19T10:00:00Z"))?.patch).toBe("7.42");
    expect(minimapAt(new Date("2026-11-01T10:00:00Z"))?.patch).toBe("7.41");
    expect(minimapAt(new Date("2026-01-01T10:00:00Z"))).toBeNull();
  });
});
