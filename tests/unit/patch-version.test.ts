import { describe, expect, it } from "vitest";
import {
  comparePatchVersions,
  officialPatchUrl,
  parsePatchVersion,
  patchVersionSortKey,
  type PatchVersion,
} from "@/modules/patches/domain/patch-version";

function v(input: string): PatchVersion {
  const res = parsePatchVersion(input);
  if (!res.ok) throw new Error(`unparsable ${input}`);
  return res.value;
}

describe("parsePatchVersion", () => {
  it("parses main and lettered versions", () => {
    expect(v("7.41")).toEqual({ major: 7, minor: 41, letter: null, value: "7.41" });
    expect(v("7.41f")).toEqual({ major: 7, minor: 41, letter: "f", value: "7.41f" });
    expect(v(" 7.08 ").value).toBe("7.08");
    expect(v("7.41F").value).toBe("7.41f");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "7", "7.4", "7.41ff", "v7.41", "7.41-f", "../7.41", "7.41 f"]) {
      expect(parsePatchVersion(bad)).toEqual({
        ok: false,
        error: { type: "invalid_patch_version", input: bad },
      });
    }
  });
});

describe("patch version ordering", () => {
  it("orders by major, minor, then letter with the main release first", () => {
    const sorted = ["7.41b", "7.08", "7.41", "7.40c", "7.41a", "7.10", "7.41f", "7.9x"]
      .filter((s) => parsePatchVersion(s).ok)
      .map(v)
      .sort(comparePatchVersions)
      .map((x) => x.value);
    expect(sorted).toEqual(["7.08", "7.10", "7.40c", "7.41", "7.41a", "7.41b", "7.41f"]);
  });

  it("gives equal versions equal sort keys and newer versions larger ones", () => {
    expect(comparePatchVersions(v("7.41"), v("7.41"))).toBe(0);
    expect(patchVersionSortKey(v("7.41z"))).toBeLessThan(patchVersionSortKey(v("7.42")));
    expect(patchVersionSortKey(v("7.99z"))).toBeLessThan(patchVersionSortKey(v("8.00")));
  });
});

describe("officialPatchUrl", () => {
  it("links the official page", () => {
    expect(officialPatchUrl("7.41f")).toBe("https://www.dota2.com/patches/7.41f");
  });
});
