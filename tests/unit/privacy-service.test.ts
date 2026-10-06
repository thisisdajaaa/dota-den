import { describe, expect, it } from "vitest";
import { exportFile, toCsv } from "@/modules/privacy/domain/export-file";
import { PrivacyService } from "@/modules/privacy/privacy.service";

const owner = { userId: "u", accountId32: 1 };

describe("PrivacyService", () => {
  it("deletes every part before the account itself", async () => {
    const order: string[] = [];
    const part = (name: string) => ({
      exportMyData: async () => ({ [name]: [name] }),
      deleteMyData: async () => {
        order.push(name);
        return { [name]: 1 };
      },
    });
    const svc = new PrivacyService({
      parts: [part("mmr"), part("goals")],
      identity: part("account"),
      logger: { info: () => {} },
      now: () => new Date("2026-10-06T10:00:00Z"),
    });
    expect(await svc.deleteAll(owner)).toEqual({ mmr: 1, goals: 1, account: 1 });
    expect(order).toEqual(["mmr", "goals", "account"]);
    const all = await svc.exportAll(owner);
    expect(all).toMatchObject({
      exportedAt: "2026-10-06T10:00:00.000Z",
      mmr: ["mmr"],
      account: ["account"],
    });
    expect((await svc.exportAsFile(owner, "json")).filename).toBe("dota-den-data-2026-10-06.json");
  });
});

describe("export files", () => {
  it("quotes CSV cells and flattens match queue and patch", () => {
    expect(toCsv([{ a: 'say "hi", ok', b: null }], ["a", "b"])).toBe('a,b\n"say ""hi"", ok",');
    const f = exportFile(
      { matches: [{ matchId: "9", queue: { queueClass: "party" }, patch: { patch: "7.41" } }] },
      "matches-csv",
      "2026-10-06",
    );
    expect(f.filename).toBe("dota-den-matches-2026-10-06.csv");
    expect(f.body.split("\n")[1]).toBe("9,,,,,,,,,,party,7.41,,");
  });
});
