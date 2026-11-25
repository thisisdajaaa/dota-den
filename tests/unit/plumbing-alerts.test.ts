import { describe, expect, it, vi } from "vitest";
import { plumbingAlert } from "@/modules/alerts/domain/alert-rules";
import { emitOpsSignal, registerOpsSink } from "@/common/ops/ops-signals";

const now = new Date("2026-11-25T03:00:00Z");

describe("plumbingAlert", () => {
  it("names the budget and keys it per day and level", () => {
    expect(
      plumbingAlert({ kind: "budget", budget: "opendota", used: 12_000, cap: 15_000 }, now),
    ).toEqual({
      kind: "budget_high",
      key: "budget:opendota:2026-11-25:high",
      vars: { budget: "OpenDota calls", used: 12_000, cap: 15_000, percent: 80 },
    });
    expect(
      plumbingAlert({ kind: "budget", budget: "llm:drafts", used: 2_000, cap: 2_000 }, now).key,
    ).toBe("budget:llm:drafts:2026-11-25:full");
  });

  it("keys Redis trouble once, whatever failed", () => {
    expect(
      plumbingAlert({ kind: "store_down", store: "redis", op: "opendota:budget" }, now),
    ).toEqual({ kind: "store_down", key: "store_down:redis", vars: { op: "opendota:budget" } });
  });
});

describe("emitOpsSignal", () => {
  it("hands signals to the registered sink and swallows its failures", async () => {
    const sink = vi.fn(async () => {
      throw new Error("alerts down");
    });
    registerOpsSink(sink);
    expect(() => emitOpsSignal({ kind: "store_down", store: "redis", op: "x" })).not.toThrow();
    await Promise.resolve();
    expect(sink).toHaveBeenCalledWith({ kind: "store_down", store: "redis", op: "x" });
  });
});
