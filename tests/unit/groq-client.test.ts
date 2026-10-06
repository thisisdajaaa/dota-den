import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GroqClient } from "@/common/llm/groq-client";

const reply = (content: string | null, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

describe("GroqClient", () => {
  it("sends the model options and returns checked JSON", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => reply('{"heroId": 5}'));
    const client = new GroqClient({ apiKey: "k", fetch, retryDelayMs: 0 });
    const res = await client.chatJson(
      z.object({ heroId: z.number() }),
      [{ role: "user", content: "pick" }],
      { model: "m", temperature: 0.3, maxTokens: 100, reasoningEffort: "medium" },
    );
    expect(res).toEqual({ ok: true, value: { heroId: 5 } });
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      model: "m",
      temperature: 0.3,
      max_completion_tokens: 100,
      reasoning_effort: "medium",
      response_format: { type: "json_object" },
    });
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ authorization: "Bearer k" });
  });

  it("retries once on 429/5xx and network errors, not on 4xx", async () => {
    const flaky = vi
      .fn<(u: string, i: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(reply("hi"));
    expect(
      await new GroqClient({ apiKey: "k", fetch: flaky, retryDelayMs: 0 }).chat([], { model: "m" }),
    ).toEqual({ ok: true, value: "hi" });
    const bad = vi.fn(async () => new Response("", { status: 400 }));
    expect(
      await new GroqClient({ apiKey: "k", fetch: bad, retryDelayMs: 0 }).chat([], { model: "m" }),
    ).toMatchObject({ ok: false, error: { type: "unavailable", cause: "status 400" } });
    expect(bad).toHaveBeenCalledTimes(1);
    const down = vi.fn(async () => Promise.reject(new TypeError("fetch failed")));
    const res = await new GroqClient({ apiKey: "k", fetch: down, retryDelayMs: 0 }).chat([], {
      model: "m",
      retries: 2,
    });
    expect(res.ok).toBe(false);
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("rejects replies that aren't JSON or don't match the schema", async () => {
    const client = (content: string) =>
      new GroqClient({ apiKey: "k", fetch: async () => reply(content), retryDelayMs: 0 });
    const schema = z.object({ mmr: z.number() });
    expect(await client("sorry").chatJson(schema, [], { model: "m" })).toMatchObject({
      ok: false,
      error: { cause: "not json" },
    });
    expect(await client('{"mmr":"x"}').chatJson(schema, [], { model: "m" })).toMatchObject({
      ok: false,
      error: { cause: "answer shape" },
    });
  });
});
