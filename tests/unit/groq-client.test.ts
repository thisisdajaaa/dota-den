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
    // The provider's reason is kept for the log.
    const denied = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "Access denied." } }), { status: 403 }),
    );
    expect(
      await new GroqClient({ apiKey: "k", fetch: denied, retryDelayMs: 0 }).chat([], {
        model: "m",
      }),
    ).toMatchObject({ ok: false, error: { cause: "status 403: Access denied." } });
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

describe("GroqClient tool calling", () => {
  const toolReply = (message: unknown) =>
    new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });

  it("sends the tools and the conversation in the wire format, and returns tool calls", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      toolReply({
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "my_mmr", arguments: "{}" } }],
      }),
    );
    const client = new GroqClient({ apiKey: "k", fetch, retryDelayMs: 0 });
    const res = await client.chatWithTools(
      [
        { role: "system", content: "rules" },
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "c0", name: "my_sessions", arguments: "{}" }],
        },
        { role: "tool", toolCallId: "c0", content: '{"games":3}' },
      ],
      {
        model: "m",
        tools: [{ name: "my_mmr", description: "d", parameters: { type: "object" } }],
      },
    );
    expect(res).toEqual({
      ok: true,
      value: { content: null, toolCalls: [{ id: "c1", name: "my_mmr", arguments: "{}" }] },
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: { name: "my_mmr", description: "d", parameters: { type: "object" } },
      },
    ]);
    expect(body.tool_choice).toBe("auto");
    expect(body.response_format).toBeUndefined();
    expect(body.messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c0", type: "function", function: { name: "my_sessions", arguments: "{}" } },
      ],
    });
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c0", content: '{"games":3}' });
  });

  it("returns the text when the model answers, and refuses a malformed completion", async () => {
    const answer = new GroqClient({
      apiKey: "k",
      fetch: async () => toolReply({ content: "Ward the river." }),
      retryDelayMs: 0,
    });
    expect(await answer.chatWithTools([], { model: "m", tools: [], toolChoice: "none" })).toEqual({
      ok: true,
      value: { content: "Ward the river.", toolCalls: [] },
    });
    const broken = new GroqClient({
      apiKey: "k",
      fetch: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      retryDelayMs: 0,
    });
    expect(await broken.chatWithTools([], { model: "m", tools: [] })).toMatchObject({
      ok: false,
      error: { type: "invalid_response" },
    });
  });
});

describe("GroqClient tool argument errors", () => {
  it("reports Groq's tool call validation failure as a bad answer, not an outage", async () => {
    const client = new GroqClient({
      apiKey: "k",
      retryDelayMs: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: { message: "Tool call validation failed: parameters for tool x did not match" },
          }),
          { status: 400 },
        ),
    });
    expect(await client.chatWithTools([], { model: "m", tools: [] })).toMatchObject({
      ok: false,
      error: { type: "invalid_response" },
    });
  });
});
