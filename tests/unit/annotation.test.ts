import { describe, expect, it } from "vitest";
import { MAX_TAGS, normalizeTag, normalizeTags } from "@/modules/annotations/domain/annotation";

describe("match tags", () => {
  it("normalizes tags to lower case words, digits, spaces and dashes", () => {
    expect(normalizeTag("  Good  Teamwork! ")).toBe("good teamwork");
    expect(normalizeTag("Mid-diff 2v1")).toBe("mid-diff 2v1");
    expect(normalizeTag("!!!")).toBeNull();
    expect(normalizeTag("a".repeat(40))).toHaveLength(20);
  });

  it("de-duplicates and caps the list", () => {
    expect(normalizeTags(["Tilted", "tilted", " TILTED "])).toEqual(["tilted"]);
    expect(normalizeTags(Array.from({ length: 10 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
  });
});
