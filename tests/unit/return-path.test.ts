import { describe, expect, it } from "vitest";
import { safeReturnPath, signInHref } from "@/modules/identity/domain/return-path";

describe("safeReturnPath", () => {
  it("keeps same-origin relative paths with their query and hash", () => {
    expect(safeReturnPath("/dashboard")).toBe("/dashboard");
    expect(safeReturnPath("/matches?queue=party&result=win")).toBe(
      "/matches?queue=party&result=win",
    );
    expect(safeReturnPath("/heroes/1#matchups")).toBe("/heroes/1#matchups");
    expect(safeReturnPath("/")).toBe("/");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(safeReturnPath("/a/../dashboard")).toBe("/dashboard");
    expect(safeReturnPath("/../../dashboard")).toBe("/dashboard");
  });

  it.each([
    ["protocol-relative", "//evil.example/path"],
    ["protocol-relative with more slashes", "///evil.example"],
    ["backslash host", "/\\evil.example"],
    ["backslash first", "\\\\evil.example"],
    ["absolute http URL", "https://evil.example/dashboard"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative without a slash", "dashboard"],
    ["empty", ""],
    ["tab inside", "/\t/evil.example"],
    ["newline inside", "/dash\nboard"],
    ["null byte", "/dash\u0000board"],
    ["API route", "/api/v1/auth/steam/login"],
    ["API root", "/api"],
  ])("rejects %s", (_label, raw) => {
    expect(safeReturnPath(raw)).toBeNull();
  });

  it("rejects non-strings and overlong values", () => {
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(["/dashboard"])).toBeNull();
    expect(safeReturnPath(`/${"a".repeat(600)}`)).toBeNull();
  });

  it("keeps encoded slashes inside the path (they never become a host)", () => {
    expect(safeReturnPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });
});

describe("signInHref", () => {
  it("carries a safe path as an encoded next parameter", () => {
    expect(signInHref("/matches?queue=party")).toBe(
      "/api/v1/auth/steam/login?next=%2Fmatches%3Fqueue%3Dparty",
    );
  });

  it("drops unsafe or missing paths", () => {
    expect(signInHref("//evil.example")).toBe("/api/v1/auth/steam/login");
    expect(signInHref(undefined)).toBe("/api/v1/auth/steam/login");
  });

  it("refuses paths that only become another host once resolved", () => {
    for (const raw of ["/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/a/..//evil.com"])
      expect(safeReturnPath(raw), raw).toBeNull();
  });
});
