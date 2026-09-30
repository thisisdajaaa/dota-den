import { describe, expect, it } from "vitest";
import { cleanPath, isNoise, newErrorEvent } from "@/modules/errors/domain/error-event";

const at = new Date("2026-10-01T00:00:00Z");

describe("error events", () => {
  it("drops query strings and fragments (they can carry personal data)", () => {
    expect(cleanPath("/draft?snapshot=abc#x")).toBe("/draft");
    expect(cleanPath("https://evil.example/x")).toBeNull();
    expect(cleanPath(null)).toBeNull();
  });

  it("groups repeats of the same error regardless of ids and numbers", () => {
    const a = newErrorEvent({
      source: "client",
      message: "Match 123 failed",
      path: "/matches/123",
      at,
    });
    const b = newErrorEvent({
      source: "client",
      message: "Match 456 failed",
      path: "/matches/456",
      at,
    });
    const c = newErrorEvent({
      source: "server",
      message: "Match 456 failed",
      path: "/matches/456",
      at,
    });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });

  it("clips long messages and stacks, and never stores an empty message", () => {
    const e = newErrorEvent({
      source: "server",
      message: "x".repeat(900),
      stack: "s".repeat(5_000),
      at,
    });
    expect(e.message.length).toBe(500);
    expect(e.stack!.length).toBe(2_000);
    expect(newErrorEvent({ source: "server", message: "  ", at }).message).toBe("Unknown error");
  });

  it("treats cut-off responses (visitor left) as noise, not bugs", () => {
    expect(isNoise("The destination stream closed early.")).toBe(true);
    expect(isNoise("aborted")).toBe(true);
    expect(isNoise("Cannot read properties of undefined (reading 'mmr')")).toBe(false);
  });
});
