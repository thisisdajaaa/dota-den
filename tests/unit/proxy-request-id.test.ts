import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const idFor = (header?: string) =>
  proxy(
    new NextRequest("http://localhost:3000/meta", {
      headers: header === undefined ? {} : { "x-request-id": header },
    }),
  ).headers.get("x-request-id");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("proxy request ID", () => {
  it("keeps a well-formed ID from the caller", () => {
    expect(idFor("req_abc-123XYZ")).toBe("req_abc-123XYZ");
  });

  it.each([
    ["none", undefined],
    ["too short", "abc"],
    ["too long", "a".repeat(65)],
    ["log-injection text", "abcdefgh level=error msg=fake"],
    ["spaces and symbols", "hello world <script>"],
  ])("generates a UUID when the caller's is %s", (_name, header) => {
    expect(idFor(header)).toMatch(UUID);
  });
});
