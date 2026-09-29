import { describe, expect, it, vi } from "vitest";
import { resolveReferences } from "@/modules/patches/domain/patch";
import { canonicalJson, contentHash } from "@/modules/patches/infrastructure/content-hash";
import {
  dotaIconPath,
  OpenDotaPatchReferenceCatalog,
} from "@/modules/patches/infrastructure/opendota-reference-catalog";
import { ValvePatchAdapter } from "@/modules/patches/infrastructure/valve-patch-adapter";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import {
  ABILITIES,
  ABILITY_IDS,
  ITEM_IDS,
  ITEMS,
  PATCH_LIST,
  patchDetail,
} from "../fixtures/valve-patches";

function gatewayFor(route: (url: URL) => { body: unknown; status?: number }) {
  const fetch = vi.fn(async (url: string) => {
    const { body, status = 200 } = route(new URL(url));
    return new Response(JSON.stringify(body), { status });
  });
  const gateway = new ProviderGateway({
    name: "test",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { gateway, fetch };
}

function adapterWith(body: unknown, status = 200) {
  const { gateway, fetch } = gatewayFor(() => ({ body, status }));
  return { adapter: new ValvePatchAdapter(gateway), fetch };
}

describe("ValvePatchAdapter.listPatches", () => {
  it("maps the official index and skips unparsable rows", async () => {
    const { adapter, fetch } = adapterWith({
      ...PATCH_LIST,
      patches: [...PATCH_LIST.patches, { patch_number: "weird" }, { patch_number: "6.x" }],
    });
    const res = await adapter.listPatches();
    expect(res.ok && res.value.map((p) => p.version)).toEqual([
      "7.40",
      "7.41",
      "7.41e",
      "7.41f",
      "7.41a",
    ]);
    expect(res.ok && res.value[3]).toEqual({
      version: "7.41f",
      name: "7.41f",
      publishedAt: new Date(1789455600 * 1000),
    });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/datafeed/patchnoteslist");
    expect(url.searchParams.get("language")).toBe("english");
  });

  it("reports an unusable index as a typed error", async () => {
    expect(await adapterWith({ success: false }).adapter.listPatches()).toMatchObject({
      ok: false,
      error: { type: "invalid_payload" },
    });
    expect(await adapterWith({}, 503).adapter.listPatches()).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
  });
});

describe("ValvePatchAdapter.fetchPatch", () => {
  it("parses every section, preserving wording and converting <br>", async () => {
    const { adapter, fetch } = adapterWith(patchDetail("7.41"));
    const res = await adapter.fetchPatch("7.41");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.value;
    expect(p).toMatchObject({
      version: "7.41",
      name: "7.41",
      publishedAt: new Date(1774335600 * 1000),
      parseStatus: "parsed",
      parseIssues: [],
      feedUrl: "https://www.dota2.com/datafeed/patchnotes?version=7.41&language=english",
    });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("version")).toBe("7.41");

    expect(p.sections.general).toEqual([
      {
        title: "Map Objectives",
        notes: [
          expect.objectContaining({ text: "Tormentor", subtitle: true, bullet: false }),
          expect.objectContaining({
            text: "Tormentor's spawn preference has switched",
            info: "Now begins in the Bottom Chasm",
            subtitle: false,
          }),
        ],
      },
    ]);
    expect(p.sections.items[0]).toMatchObject({
      itemId: null,
      title: "Shop Reshuffle",
      isGeneralNote: true,
    });
    expect(p.sections.items[1].notes[0].text).toBe(
      "Cooldown increased from 15 to 16\nApplies to illusions",
    );
    expect(p.sections.heroes[0]).toMatchObject({
      heroId: 1,
      heroNotes: [{ text: "Base Armor increased by 1", icon: "armor" }],
      talentNotes: [{ text: "Level 20 Talent +150 Blink Cast Range" }],
    });
    expect(p.sections.heroes[0].abilities[0].notes).toEqual([
      expect.objectContaining({ aghanims: "scepter", indentLevel: 1 }),
      expect.objectContaining({ indentLevel: 2 }),
    ]);
    expect(p.sections.heroes[1].heroNotes).toEqual([]);
    expect(p.sections.neutralCreeps).toEqual([
      {
        key: "npc_dota_neutral_kobold_taskmaster",
        name: "Kobold Foreman",
        notes: [expect.objectContaining({ text: "Damage increased from 22–24 to 24–26" })],
      },
    ]);
  });

  it("accepts lettered patches that omit sections", async () => {
    const body = patchDetail("7.41f");
    delete body.general_notes;
    delete body.neutral_creeps;
    const res = await adapterWith(body).adapter.fetchPatch("7.41f");
    expect(res.ok && res.value).toMatchObject({ version: "7.41f", parseStatus: "parsed" });
    expect(res.ok && res.value.sections.general).toEqual([]);
  });

  it("degrades to partial with reasons for malformed entries and unknown sections", async () => {
    const body = patchDetail("7.41", {
      heroes: [
        { hero_id: "one" },
        { hero_id: 2, hero_notes: [{ note: 5 }, { indent_level: 1, note: "Kept" }] },
      ],
      neutral_items: "not a list",
      map_changes: [{ note: "Something new" }],
    });
    const res = await adapterWith(body).adapter.fetchPatch("7.41");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.parseStatus).toBe("partial");
    expect(res.value.parseIssues).toEqual(
      expect.arrayContaining([
        "heroes[0]: malformed entry",
        "heroes[1].hero_notes[0]: malformed note",
        "neutral_items: expected a list",
        "map_changes: unrecognized section",
      ]),
    );
    expect(res.value.sections.heroes).toEqual([
      expect.objectContaining({
        heroId: 2,
        heroNotes: [expect.objectContaining({ text: "Kept" })],
      }),
    ]);
    expect(res.value.sections.items).toHaveLength(2);
  });

  it("fails (keeping version and hash) when nothing is usable", async () => {
    const garbage = { patch_number: "7.41", heroes: [1, 2], items: ["x"], success: true };
    const res = await adapterWith(garbage).adapter.fetchPatch("7.41");
    expect(res.ok && res.value).toMatchObject({
      version: "7.41",
      parseStatus: "failed",
      contentHash: contentHash(garbage),
    });
    expect(res.ok && res.value.sections.heroes).toEqual([]);

    const noHeader = await adapterWith({ heroes: [] }).adapter.fetchPatch("7.41");
    expect(noHeader.ok && noHeader.value).toMatchObject({
      parseStatus: "failed",
      parseIssues: ["missing or invalid patch header"],
    });

    const mismatch = await adapterWith(patchDetail("7.40")).adapter.fetchPatch("7.41");
    expect(mismatch.ok && mismatch.value.parseStatus).toBe("failed");
  });

  it("maps the feed's unknown-version answer and transport errors to typed errors", async () => {
    const missing = { success: false, message: "Can't find patch notes for version '6.70'" };
    expect(await adapterWith(missing).adapter.fetchPatch("6.70")).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
    expect(await adapterWith({}, 500).adapter.fetchPatch("7.41")).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
  });

  it("rejects invalid versions without calling upstream", async () => {
    const { adapter, fetch } = adapterWith(patchDetail());
    expect(await adapter.fetchPatch("../patchnoteslist")).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("contentHash", () => {
  it("is stable across key order and changes with content", () => {
    const a = patchDetail("7.41");
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    expect(contentHash(reordered)).toBe(contentHash(a));
    expect(canonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"e":0,"f":1}]},"b":1}',
    );
    expect(contentHash(patchDetail("7.41", { patch_timestamp: 1 }))).not.toBe(contentHash(a));
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("OpenDotaPatchReferenceCatalog", () => {
  const constants: Record<string, unknown> = {
    ability_ids: ABILITY_IDS,
    abilities: ABILITIES,
    item_ids: ITEM_IDS,
    items: ITEMS,
  };

  it("resolves ability and item ids; unknown ids stay ids", async () => {
    const { gateway } = gatewayFor((url) => ({
      body: constants[url.pathname.split("/").pop() ?? ""],
    }));
    const refs = await new OpenDotaPatchReferenceCatalog(gateway).getReferences();
    expect(refs.ok).toBe(true);
    if (!refs.ok) return;

    const adapter = adapterWith(patchDetail()).adapter;
    const fetched = await adapter.fetchPatch("7.41");
    if (!fetched.ok) throw new Error("fixture should parse");
    const s = resolveReferences(fetched.value.sections, refs.value);

    expect(s.heroes[0].abilities).toEqual([
      expect.objectContaining({
        abilityId: 5003,
        abilityKey: "antimage_mana_break",
        abilityName: "Mana Break",
        iconPath: "/apps/dota2/images/dota_react/abilities/antimage_mana_break.png",
      }),
      expect.objectContaining({ abilityId: 999999, abilityKey: null, abilityName: null }),
    ]);
    // Untrusted icon host is dropped, name kept.
    expect(s.heroes[1].abilities[0]).toMatchObject({ abilityName: "Meat Hook", iconPath: null });
    expect(s.items[1]).toMatchObject({
      itemId: 1,
      itemName: "Blink Dagger",
      iconPath: "/apps/dota2/images/dota_react/items/blink.png",
    });
    expect(s.neutralItems[0]).toMatchObject({ itemName: "Occult Bracelet", iconPath: null });
  });

  it("surfaces upstream failure as an error", async () => {
    const { gateway } = gatewayFor(() => ({ body: {}, status: 503 }));
    expect(await new OpenDotaPatchReferenceCatalog(gateway).getReferences()).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
  });

  it("only keeps Dota CDN icon paths", () => {
    expect(dotaIconPath("/apps/dota2/images/x.png?t=1")).toBe("/apps/dota2/images/x.png");
    expect(dotaIconPath("/apps/dota2/../x.png")).toBeNull();
    expect(dotaIconPath("https://evil.example/x.png")).toBeNull();
    expect(dotaIconPath(undefined)).toBeNull();
  });
});
