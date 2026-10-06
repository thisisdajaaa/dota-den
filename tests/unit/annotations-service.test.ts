import { describe, expect, it } from "vitest";
import type { MatchAnnotation } from "@/modules/annotations/annotations.model";
import type { AnnotationsRepositoryPort } from "@/modules/annotations/annotations.ports";
import { AnnotationsService } from "@/modules/annotations/annotations.service";

class MemoryRepo implements AnnotationsRepositoryPort {
  rows = new Map<string, MatchAnnotation>();
  async find(u: string, m: string) {
    return this.rows.get(`${u}:${m}`) ?? null;
  }
  async save(a: MatchAnnotation) {
    this.rows.set(`${a.userId}:${a.matchId}`, a);
  }
  async remove(u: string, m: string) {
    this.rows.delete(`${u}:${m}`);
  }
  async tagCounts() {
    return [];
  }
  async matchIdsWithTag() {
    return [];
  }
  async exportForOwner() {
    return [];
  }
  async deleteForOwner() {
    return 0;
  }
}

const owner = { userId: "u1", accountId32: 1 };

describe("AnnotationsService", () => {
  it("normalises tags and trims the note before saving", async () => {
    const repo = new MemoryRepo();
    const svc = new AnnotationsService({ repository: repo, now: () => new Date(0) });
    expect(
      await svc.save(owner, "123456", {
        tags: ["Tilted!", "tilted", " Bad  Draft "],
        note: "  gg  ",
      }),
    ).toEqual({
      tags: ["tilted", "bad draft"],
      note: "gg",
    });
    expect(repo.rows.get("u1:123456")).toMatchObject({ accountId32: 1, updatedAt: new Date(0) });
  });

  it("removes the annotation when tags and note are cleared", async () => {
    const repo = new MemoryRepo();
    const svc = new AnnotationsService({ repository: repo });
    await svc.save(owner, "123456", { tags: ["comeback"], note: "" });
    expect(await svc.save(owner, "123456", { tags: [], note: "   " })).toEqual({
      tags: [],
      note: "",
    });
    expect(repo.rows.size).toBe(0);
    expect(await svc.get("u1", "123456")).toEqual({ tags: [], note: "" });
  });
});
