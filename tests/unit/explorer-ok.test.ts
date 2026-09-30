import { describe, expect, it } from "vitest";
import { explorerOk } from "@/modules/meta/infrastructure/opendota-meta-source";

describe("explorerOk", () => {
  it("accepts rows without an error, and nothing else", () => {
    expect(explorerOk({ rows: [{ a: 1 }], err: null })).toBe(true);
    expect(explorerOk({ rows: [], err: "" })).toBe(true);
    expect(explorerOk({ rows: null, err: "statement timeout" })).toBe(false);
    expect(explorerOk({ rows: [{ a: 1 }], err: "partial" })).toBe(false);
    expect(explorerOk({ err: { message: "x" } })).toBe(false);
    expect(explorerOk("nope")).toBe(false);
  });
});
