import { describe, expect, it } from "vitest";
import {
  PATCH_RETRY_AFTER_MS,
  PATCH_STALE_AFTER_MS,
  PatchImportService,
  sortNewestFirst,
} from "@/modules/patches/services/patch-import.service";
import { patchDetail } from "../fixtures/valve-patches";
import {
  fakeReferences,
  InMemoryPatchRepository,
  InMemoryRefreshState,
  scriptedValve,
} from "../support/patch-fakes";

function setup(start = new Date("2026-09-30T00:00:00Z")) {
  const valve = scriptedValve();
  const patches = new InMemoryPatchRepository();
  const refreshState = new InMemoryRefreshState();
  const references = fakeReferences();
  const clock = { now: start };
  const service = new PatchImportService({
    source: valve.adapter,
    references,
    patches,
    refreshState,
    now: () => clock.now,
  });
  return { service, valve, patches, refreshState, references, clock };
}

describe("sortNewestFirst", () => {
  it("orders by version, letters after the main release", () => {
    expect(
      sortNewestFirst([
        { version: "7.41" },
        { version: "7.41f" },
        { version: "7.40" },
        { version: "7.41a" },
      ]).map((x) => x.version),
    ).toEqual(["7.41f", "7.41a", "7.41", "7.40"]);
  });
});

describe("PatchImportService.importLatest", () => {
  it("imports the newest n versions and is idempotent on re-run", async () => {
    const { service, patches, valve } = setup();
    const first = await service.importLatest(3);
    expect(first.ok && first.value).toEqual([
      { version: "7.41f", outcome: "inserted", parseStatus: "parsed", parseRevision: 1 },
      { version: "7.41e", outcome: "inserted", parseStatus: "parsed", parseRevision: 1 },
      { version: "7.41a", outcome: "inserted", parseStatus: "parsed", parseRevision: 1 },
    ]);
    const stored = patches.docs.get("7.41f");
    expect(stored).toMatchObject({
      sourceUrl: "https://www.dota2.com/patches/7.41f",
      publishedAt: new Date(1789455600 * 1000),
      language: "english",
      referencesResolved: true,
    });
    expect(stored?.sections.heroes[0].abilities[0].abilityName).toBe("Mana Break");

    const second = await service.importLatest(3);
    expect(second.ok && second.value.map((o) => o.outcome)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(patches.writes).toBe(3);
    expect(valve.state.calls.filter((c) => c.includes("patchnoteslist"))).toHaveLength(1); // cached
  });

  it("replaces changed content with parseRevision + 1", async () => {
    const { service, patches, valve } = setup();
    await service.importVersion("7.41");
    valve.state.details.set("7.41", patchDetail("7.41", { heroes: [] }));
    expect(await service.importVersion("7.41")).toEqual({
      version: "7.41",
      outcome: "updated",
      parseStatus: "parsed",
      parseRevision: 2,
    });
    expect(patches.docs.get("7.41")?.sections.heroes).toEqual([]);
  });

  it("returns a provider error when the index is unavailable", async () => {
    const { service, valve } = setup();
    valve.state.status = 503;
    expect(await service.importLatest()).toMatchObject({
      ok: false,
      error: { type: "provider", error: { type: "unavailable" } },
    });
  });
});

describe("PatchImportService failure handling", () => {
  it("stores a failed placeholder (version + official link) when detail is missing", async () => {
    const { service, patches, valve } = setup();
    valve.state.details.delete("7.41e");
    expect(await service.importVersion("7.41e")).toMatchObject({
      version: "7.41e",
      outcome: "failed",
      parseStatus: "failed",
      reason: "not_found",
    });
    expect(patches.docs.get("7.41e")).toMatchObject({
      parseStatus: "failed",
      contentHash: null,
      sourceUrl: "https://www.dota2.com/patches/7.41e",
      publishedAt: new Date(1785394800 * 1000),
      name: "7.41e",
    });

    // Recovers once the feed has it.
    valve.state.details.set("7.41e", patchDetail("7.41e"));
    expect(await service.importVersion("7.41e")).toMatchObject({
      outcome: "updated",
      parseStatus: "parsed",
      parseRevision: 2,
    });
  });

  it("stores nothing for versions absent from the official index", async () => {
    const { service, patches } = setup();
    expect(await service.importVersion("7.99")).toMatchObject({
      outcome: "failed",
      parseStatus: null,
    });
    expect(await service.importVersion("nonsense")).toMatchObject({
      outcome: "failed",
      reason: "invalid_version",
    });
    expect(patches.docs.size).toBe(0);
  });

  it("keeps stored content when a later fetch or parse fails", async () => {
    const { service, patches, valve } = setup();
    await service.importVersion("7.41");
    const before = patches.docs.get("7.41");

    valve.state.details.set("7.41", { patch_number: "7.41", heroes: ["broken"], success: true });
    expect(await service.importVersion("7.41")).toMatchObject({
      outcome: "failed",
      parseStatus: "parsed",
      reason: "parse_failed_kept_previous",
    });

    valve.state.status = 503;
    expect(await service.importVersion("7.41")).toMatchObject({
      outcome: "failed",
      parseStatus: "parsed",
    });
    expect(patches.docs.get("7.41")).toBe(before);
  });

  it("stores partial parses with reasons", async () => {
    const { service, patches, valve } = setup();
    valve.state.details.set("7.41", patchDetail("7.41", { mystery: [1] }));
    expect(await service.importVersion("7.41")).toMatchObject({
      outcome: "inserted",
      parseStatus: "partial",
    });
    expect(patches.docs.get("7.41")?.parseIssues).toEqual(["mystery: unrecognized section"]);
  });

  it("imports without names when the catalog is down, then fills them in on the next run", async () => {
    const { service, patches, references } = setup();
    references.available = false;
    await service.importVersion("7.41");
    expect(patches.docs.get("7.41")).toMatchObject({
      referencesResolved: false,
      parseStatus: "parsed",
    });
    expect(patches.docs.get("7.41")?.sections.heroes[0].abilities[0].abilityName).toBeNull();

    references.available = true;
    expect(await service.importVersion("7.41")).toMatchObject({
      outcome: "updated",
      parseRevision: 2,
    });
    expect(patches.docs.get("7.41")?.sections.heroes[0].abilities[0].abilityName).toBe(
      "Mana Break",
    );
  });
});

describe("PatchImportService.refreshIfStale", () => {
  it("runs when empty, skips while fresh, and runs again after 24h", async () => {
    const { service, clock } = setup();
    const first = await service.refreshIfStale();
    expect(first.ran).toBe(true);

    clock.now = new Date(clock.now.getTime() + 60 * 60 * 1000);
    expect(await service.refreshIfStale()).toEqual({ ran: false, reason: "fresh" });

    clock.now = new Date(clock.now.getTime() + PATCH_STALE_AFTER_MS);
    expect((await service.refreshIfStale()).ran).toBe(true);
  });

  it("throttles retries after a failed run", async () => {
    const { service, valve, clock } = setup();
    valve.state.status = 503;
    const first = await service.refreshIfStale();
    expect(first.ran && first.result.ok).toBe(false);
    expect(await service.refreshIfStale()).toEqual({ ran: false, reason: "recently_attempted" });

    valve.state.status = 200;
    clock.now = new Date(clock.now.getTime() + PATCH_RETRY_AFTER_MS);
    expect((await service.refreshIfStale()).ran).toBe(true);
  });
});
