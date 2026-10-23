import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import { AUTO_PARSE_DEDUP_MS, AUTO_PARSE_MAX_AGE_MS } from "@/modules/matches/domain/sync-policy";
import type { ParseRequestsPort } from "@/modules/matches/matches.ports";
import { AutoParseService } from "@/modules/matches/services/auto-parse.service";

const NOW = new Date("2026-10-23T12:00:00Z");
const USER = { id: "u1", accountId32: 22202 };

function make(
  opts: {
    plus?: boolean;
    unparsed?: string[];
    claimed?: string[];
    allow?: number;
    upstream?: "busy";
  } = {},
) {
  const claims = new Set(opts.claimed ?? []);
  const requests: ParseRequestsPort = {
    recentUnparsed: vi.fn(async (_id: number, _since: Date, limit: number) =>
      (opts.unparsed ?? ["9", "8", "7", "6", "5"]).slice(0, limit),
    ),
    claim: vi.fn(async (id: string) => {
      if (claims.has(id)) return false;
      claims.add(id);
      return true;
    }),
    release: vi.fn(async (id: string) => {
      claims.delete(id);
    }),
  };
  let allowance = opts.allow ?? 6;
  const requestParse = vi.fn(async () =>
    opts.upstream === "busy"
      ? err({ type: "rate_limited" as const, retryAfterMs: null })
      : ok(true as const),
  );
  const service = new AutoParseService({
    requests,
    provider: { requestParse },
    isPlus: async () => opts.plus ?? true,
    allow: async () => allowance-- > 0,
    logger: { info: () => {}, warn: () => {} },
    now: () => NOW,
  });
  return { service, requests, requestParse, claims };
}

describe("AutoParseService (Plus)", () => {
  it("asks for the newest unparsed recent games, at most 3 per sync", async () => {
    const { service, requests, requestParse } = make();
    expect(await service.afterSync(USER)).toEqual({ outcome: "done", requested: 3 });
    expect(requestParse.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["9", "8", "7"]);
    expect(requests.recentUnparsed).toHaveBeenCalledWith(
      USER.accountId32,
      new Date(NOW.getTime() - AUTO_PARSE_MAX_AGE_MS),
      9,
    );
    expect(requests.claim).toHaveBeenCalledWith("9", NOW, AUTO_PARSE_DEDUP_MS);
  });

  it("does nothing for free players", async () => {
    const { service, requestParse, requests } = make({ plus: false });
    expect(await service.afterSync(USER)).toEqual({ outcome: "not_plus", requested: 0 });
    expect(requests.recentUnparsed).not.toHaveBeenCalled();
    expect(requestParse).not.toHaveBeenCalled();
  });

  it("skips games asked for recently (dedupe)", async () => {
    const { service, requestParse } = make({ claimed: ["9", "7"] });
    await service.afterSync(USER);
    expect(requestParse.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["8", "6", "5"]);
  });

  it("stops at the parse rate limit or when OpenDota is busy, giving the claim back", async () => {
    const limited = make({ allow: 1 });
    expect(await limited.service.afterSync(USER)).toEqual({
      outcome: "rate_limited",
      requested: 1,
    });
    expect(limited.claims.has("8")).toBe(false);
    const busy = make({ upstream: "busy" });
    expect(await busy.service.afterSync(USER)).toEqual({ outcome: "upstream_busy", requested: 0 });
    expect(busy.requestParse).toHaveBeenCalledTimes(1);
    expect(busy.claims.has("9")).toBe(false);
  });
});
