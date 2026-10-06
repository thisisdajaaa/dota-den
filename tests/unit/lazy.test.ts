import { describe, expect, it, vi } from "vitest";
import { lazy } from "@/common/utils/lazy";

describe("lazy", () => {
  it("builds once, on first use, with methods bound to the instance", () => {
    const factory = vi.fn(() => ({
      n: 2,
      double() {
        return this.n * 2;
      },
    }));
    const svc = lazy(factory);
    expect(factory).not.toHaveBeenCalled();
    const { double } = svc;
    expect(double()).toBe(4);
    expect(svc.n).toBe(2);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
