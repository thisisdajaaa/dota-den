import { describe, expect, it, vi } from "vitest";
import { parseScreenshotAnswer } from "@/modules/mmr/domain/screenshot-read";
import { GroqScreenshotReader } from "@/modules/mmr/infrastructure/groq-screenshot-reader";

describe("parseScreenshotAnswer", () => {
  it("reads the JSON, even after thinking or prose", () => {
    expect(parseScreenshotAnswer('{"mmr": 5420, "seen": "next to the medal"}')).toEqual({
      mmr: 5420,
      seen: "next to the medal",
    });
    expect(
      parseScreenshotAnswer(
        '<think>it says {"mmr": 1}</think> Sure: {"mmr": "5,420", "seen": "profile"}',
      ),
    ).toEqual({ mmr: 5420, seen: "profile" });
  });

  it("treats anything implausible as not found", () => {
    for (const bad of [
      '{"mmr": 99999}',
      '{"mmr": -5}',
      '{"mmr": 54.2}',
      '{"mmr": null, "seen": "x"}',
      "no json here",
      "",
      null,
    ]) {
      expect(parseScreenshotAnswer(bad).mmr).toBeNull();
    }
  });
});

describe("GroqScreenshotReader", () => {
  it("sends the image to the vision model and parses its answer", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"mmr": 4100, "seen": "post-game"}' } }],
          }),
        ),
    );
    const reader = new GroqScreenshotReader({ apiKey: "k", model: "m", fetch });
    expect(await reader.read({ type: "image/png", base64: "AAAA" })).toEqual({
      mmr: 4100,
      seen: "post-game",
    });
    const body = JSON.parse(
      String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.model).toBe("m");
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/png;base64,AAAA");
  });

  it("returns null when the provider fails", async () => {
    const reader = new GroqScreenshotReader({
      apiKey: "k",
      model: "m",
      fetch: async () => new Response("nope", { status: 500 }),
    });
    expect(await reader.read({ type: "image/png", base64: "AAAA" })).toBeNull();
  });
});
