import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/common/cache/redis", () => ({ getRedis: () => null }));
vi.mock("@/common/config/env", () => ({ env: () => ({ APP_URL: "http://localhost:3000" }) }));

const { handler } = await import("@/common/http/controller");
const { ServiceResponse } = await import("@/common/http/service-response");
const { NotFoundError, UnauthorizedError } = await import("@/common/errors/app-error");
const { apiRequest, ApiClientError } = await import("@/common/http/api-client");

const req = (method: string, body?: unknown, origin = "http://localhost:3000") =>
  new NextRequest("http://localhost:3000/api/v1/thing?page=2", {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("controller handler", () => {
  const save = handler(
    {
      guard: async () => ({ id: "u1" }),
      body: z.object({ name: z.string().min(1) }),
      query: z.object({ page: z.coerce.number() }),
      params: z.object({ id: z.string() }),
    },
    async ({ user, body, query, params }) =>
      ServiceResponse.created({ who: user.id, name: body.name, page: query.page, id: params.id }),
  );
  const route = { params: Promise.resolve({ id: "7" }) };

  it("validates and wraps the result in the envelope", async () => {
    const res = await save(req("POST", { name: "Pudge" }), route);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      message: "Created",
      data: { who: "u1", name: "Pudge", page: 2, id: "7" },
      statusCode: 201,
    });
  });

  it("rejects bad bodies and other origins with failure envelopes", async () => {
    const bad = await save(req("POST", { name: "" }), route);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ success: false, code: "bad_request", data: null });
    const cross = await save(req("POST", { name: "x" }, "https://evil.example"), route);
    expect(cross.status).toBe(403);
  });

  it("maps AppErrors from the guard and the action; rethrows anything else", async () => {
    const guarded = handler(
      { guard: async () => Promise.reject(new UnauthorizedError()) },
      async () => ServiceResponse.success(1),
    );
    expect((await guarded(req("GET"))).status).toBe(401);
    const missing = handler({}, async () => {
      throw new NotFoundError("No such match");
    });
    expect(await (await missing(req("GET"))).json()).toMatchObject({
      message: "No such match",
      statusCode: 404,
    });
    const broken = handler({}, async () => {
      throw new Error("bug");
    });
    await expect(broken(req("GET"))).rejects.toThrow("bug");
  });

  it("rate limits per user", async () => {
    const limited = handler(
      { guard: async () => ({ id: "u9" }), rateLimit: { name: "t", limit: 1, windowMs: 60_000 } },
      async () => ServiceResponse.success(true),
    );
    expect((await limited(req("GET"))).status).toBe(200);
    const second = await limited(req("GET"));
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
  });
});

describe("api client", () => {
  const respond = (body: unknown, status = 200) =>
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));

  it("unwraps data and throws the server's message", async () => {
    respond({ success: true, message: "OK", data: { a: 1 }, statusCode: 200 });
    expect(await apiRequest("/api/x")).toEqual({ a: 1 });
    respond(
      {
        success: false,
        message: "Invalid goals",
        data: null,
        statusCode: 400,
        code: "bad_request",
      },
      400,
    );
    const e = await apiRequest("/api/x", { body: {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiClientError);
    expect(e).toMatchObject({ message: "Invalid goals", status: 400, code: "bad_request" });
  });
});
