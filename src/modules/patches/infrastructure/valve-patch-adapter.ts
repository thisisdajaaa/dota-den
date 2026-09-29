import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/modules/shared/infrastructure/provider-gateway";
import {
  cleanNoteText,
  EMPTY_SECTIONS,
  type AbilityPatchNotes,
  type HeroPatchNotes,
  type ItemPatchNotes,
  type NeutralCreepPatchNotes,
  type NoteGroup,
  type PatchNote,
  type PatchSections,
} from "../domain/patch";
import { parsePatchVersion } from "../domain/patch-version";
import type {
  FetchedPatch,
  PatchListEntry,
  PatchSource,
  ProviderError,
} from "../application/ports";
import { contentHash } from "./content-hash";

export const VALVE_DATAFEED_BASE_URL = "https://www.dota2.com/datafeed";
/** Bump when the mapping below changes; stored patches are re-parsed on the next import. */
export const VALVE_PATCH_PARSER_VERSION = 1;

const LANGUAGE = "english";

const ListSchema = z.object({
  success: z.literal(true),
  patches: z.array(z.unknown()),
});

const ListEntrySchema = z.object({
  patch_number: z.string(),
  patch_name: z.string().optional(),
  patch_timestamp: z.number().int().positive(),
});

const HeaderSchema = z.object({
  success: z.literal(true).optional(),
  patch_number: z.string(),
  patch_name: z.string().optional(),
  patch_timestamp: z.number().int().positive().optional(),
});

const NoteSchema = z.object({
  indent_level: z.number().int().min(0).max(10).optional(),
  note: z.string(),
  info: z.string().optional(),
  aghanims: z.string().optional(),
  icon: z.string().optional(),
  hide_dot: z.boolean().optional(),
});

const noteList = z.array(z.unknown()).optional();

const GeneralGroupSchema = z.object({ title: z.string().optional(), generic: noteList });

const ItemEntrySchema = z.object({
  ability_id: z.number().int(),
  title: z.string().optional(),
  is_general_note: z.boolean().optional(),
  ability_notes: noteList,
});

const HeroEntrySchema = z.object({
  hero_id: z.number().int().positive(),
  hero_notes: noteList,
  talent_notes: noteList,
  abilities: z.array(z.unknown()).optional(),
});

const AbilityEntrySchema = z.object({
  ability_id: z.number().int(),
  ability_notes: noteList,
});

const NeutralCreepSchema = z.object({
  name: z.string(),
  localized_name: z.string(),
  neutral_creep_notes: noteList,
});

/** Top-level keys we understand. Anything else is content we would silently drop. */
const META_KEYS = new Set(["success", "patch_number", "patch_name", "patch_timestamp"]);
const SECTION_KEYS = new Set([
  "general_notes",
  "items",
  "neutral_items",
  "heroes",
  "neutral_creeps",
]);

function toProviderError(res: Exclude<GatewayResponse, { ok: true }>): ProviderError {
  switch (res.kind) {
    case "not_found":
      return { type: "not_found" };
    case "rate_limited":
      return { type: "rate_limited", retryAfterMs: res.retryAfterMs };
    case "circuit_open":
      return { type: "unavailable", cause: "circuit_open" };
    case "failed":
      return { type: "unavailable", cause: res.cause };
  }
}

const SUBTITLE = /class=["']?Subtitle/i;
const AGHANIMS = new Set(["scepter", "shard"]);

/** Collects per-entry problems; any issue makes the parse `partial`. */
class Issues {
  readonly list: string[] = [];
  add(issue: string): void {
    // Cap the list so a wholesale format change doesn't produce huge documents.
    if (this.list.length < 50) this.list.push(issue);
    else if (this.list.length === 50) this.list.push("…more issues omitted");
  }
}

function parseNotes(raw: unknown[] | undefined, path: string, issues: Issues): PatchNote[] {
  const out: PatchNote[] = [];
  (raw ?? []).forEach((entry, i) => {
    const n = NoteSchema.safeParse(entry);
    if (!n.success) {
      issues.add(`${path}[${i}]: malformed note`);
      return;
    }
    const text = cleanNoteText(n.data.note);
    // Lines that were only `<br>` are layout spacers, not content.
    if (!text) return;
    const info = n.data.info === undefined ? "" : cleanNoteText(n.data.info);
    const aghanims = n.data.aghanims?.toLowerCase();
    out.push({
      text,
      indentLevel: n.data.indent_level ?? 1,
      info: info || null,
      aghanims: aghanims && AGHANIMS.has(aghanims) ? (aghanims as "scepter" | "shard") : null,
      icon: n.data.icon ?? null,
      subtitle: SUBTITLE.test(n.data.note),
      bullet: n.data.hide_dot !== true,
    });
  });
  return out;
}

function parseArray<T>(
  body: Record<string, unknown>,
  key: string,
  issues: Issues,
  map: (entry: unknown, path: string) => T | null,
): T[] {
  const raw = body[key];
  if (raw === undefined) return []; // Sections are omitted when a patch has no such changes.
  if (!Array.isArray(raw)) {
    issues.add(`${key}: expected a list`);
    return [];
  }
  return raw.flatMap((entry, i) => {
    const mapped = map(entry, `${key}[${i}]`);
    return mapped === null ? [] : [mapped];
  });
}

const optionalTitle = (raw: string | undefined): string | null =>
  raw === undefined ? null : cleanNoteText(raw) || null;

function parseSections(body: Record<string, unknown>, issues: Issues): PatchSections {
  const invalid = (path: string): null => {
    issues.add(`${path}: malformed entry`);
    return null;
  };

  const general = parseArray<NoteGroup>(body, "general_notes", issues, (e, path) => {
    const g = GeneralGroupSchema.safeParse(e);
    if (!g.success) return invalid(path);
    return { title: optionalTitle(g.data.title), notes: parseNotes(g.data.generic, path, issues) };
  });

  const item = (e: unknown, path: string): ItemPatchNotes | null => {
    const it = ItemEntrySchema.safeParse(e);
    if (!it.success) return invalid(path);
    return {
      // Valve uses -1 (or 0) for headings that don't refer to a specific item.
      itemId: it.data.ability_id > 0 ? it.data.ability_id : null,
      itemKey: null,
      itemName: null,
      iconPath: null,
      title: optionalTitle(it.data.title),
      isGeneralNote: it.data.is_general_note === true,
      notes: parseNotes(it.data.ability_notes, path, issues),
    };
  };

  const heroes = parseArray<HeroPatchNotes>(body, "heroes", issues, (e, path) => {
    const h = HeroEntrySchema.safeParse(e);
    if (!h.success) return invalid(path);
    const abilities = (h.data.abilities ?? []).flatMap((a, i): AbilityPatchNotes[] => {
      const ab = AbilityEntrySchema.safeParse(a);
      if (!ab.success) {
        invalid(`${path}.abilities[${i}]`);
        return [];
      }
      return [
        {
          abilityId: ab.data.ability_id,
          abilityKey: null,
          abilityName: null,
          iconPath: null,
          notes: parseNotes(ab.data.ability_notes, `${path}.abilities[${i}]`, issues),
        },
      ];
    });
    return {
      heroId: h.data.hero_id,
      heroNotes: parseNotes(h.data.hero_notes, `${path}.hero_notes`, issues),
      talentNotes: parseNotes(h.data.talent_notes, `${path}.talent_notes`, issues),
      abilities,
    };
  });

  const neutralCreeps = parseArray<NeutralCreepPatchNotes>(
    body,
    "neutral_creeps",
    issues,
    (e, path) => {
      const c = NeutralCreepSchema.safeParse(e);
      if (!c.success) return invalid(path);
      return {
        key: c.data.name,
        name: c.data.localized_name,
        notes: parseNotes(c.data.neutral_creep_notes, path, issues),
      };
    },
  );

  for (const key of Object.keys(body)) {
    if (!META_KEYS.has(key) && !SECTION_KEYS.has(key)) issues.add(`${key}: unrecognized section`);
  }

  return {
    general,
    items: parseArray(body, "items", issues, item),
    neutralItems: parseArray(body, "neutral_items", issues, item),
    heroes,
    neutralCreeps,
  };
}

function rawEntryCount(body: Record<string, unknown>): number {
  let n = 0;
  for (const [key, value] of Object.entries(body)) {
    if (!META_KEYS.has(key) && Array.isArray(value)) n += value.length;
  }
  return n;
}

function parsedEntryCount(s: PatchSections): number {
  return (
    s.general.length +
    s.items.length +
    s.neutralItems.length +
    s.heroes.length +
    s.neutralCreeps.length
  );
}

/**
 * Anti-corruption layer for Valve's official patch notes datafeed. Tolerant by design:
 * malformed entries and unknown sections degrade the result to `partial` with reasons;
 * an unusable payload yields `failed`. It never invents content.
 */
export class ValvePatchAdapter implements PatchSource {
  readonly parserVersion = VALVE_PATCH_PARSER_VERSION;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl?: string } = {},
  ) {}

  private url(path: string, params: Record<string, string>): string {
    const url = new URL(`${this.opts.baseUrl ?? VALVE_DATAFEED_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }

  feedUrl(version: string): string {
    return this.url("/patchnotes", { version, language: LANGUAGE });
  }

  async listPatches(): Promise<Result<PatchListEntry[], ProviderError>> {
    const res = await this.gateway.getJson(this.url("/patchnoteslist", { language: LANGUAGE }), {
      cacheTtlMs: 5 * 60 * 1000,
    });
    if (!res.ok) return err(toProviderError(res));
    const parsed = ListSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "patch list" });

    const out: PatchListEntry[] = [];
    for (const raw of parsed.data.patches) {
      const entry = ListEntrySchema.safeParse(raw);
      if (!entry.success) continue;
      const version = parsePatchVersion(entry.data.patch_number);
      if (!version.ok) continue;
      out.push({
        version: version.value.value,
        name: entry.data.patch_name || version.value.value,
        publishedAt: new Date(entry.data.patch_timestamp * 1000),
      });
    }
    if (out.length === 0) return err({ type: "invalid_payload", cause: "empty patch list" });
    return ok(out);
  }

  async fetchPatch(version: string): Promise<Result<FetchedPatch, ProviderError>> {
    const requested = parsePatchVersion(version);
    if (!requested.ok) return err({ type: "not_found" });
    const v = requested.value.value;
    const feedUrl = this.feedUrl(v);

    const res = await this.gateway.getJson(feedUrl);
    if (!res.ok) return err(toProviderError(res));
    const body = res.body;

    // The feed answers unknown versions with 200 and `{ success: false, message }`.
    if (typeof body === "object" && body !== null && "success" in body && body.success === false)
      return err({ type: "not_found" });

    const base = {
      version: v,
      name: v,
      publishedAt: null,
      feedUrl,
      contentHash: contentHash(body),
      parserVersion: VALVE_PATCH_PARSER_VERSION,
    };
    const failed = (issue: string): Result<FetchedPatch, ProviderError> =>
      ok({ ...base, parseStatus: "failed", parseIssues: [issue], sections: EMPTY_SECTIONS });

    if (typeof body !== "object" || body === null || Array.isArray(body))
      return failed("payload is not an object");
    const header = HeaderSchema.safeParse(body);
    if (!header.success) return failed("missing or invalid patch header");
    const upstreamVersion = parsePatchVersion(header.data.patch_number);
    if (!upstreamVersion.ok || upstreamVersion.value.value !== v)
      return failed(`version mismatch: feed returned "${header.data.patch_number}"`);

    const record = body as Record<string, unknown>;
    const issues = new Issues();
    const sections = parseSections(record, issues);
    const nothingUsable = parsedEntryCount(sections) === 0 && rawEntryCount(record) > 0;

    return ok({
      ...base,
      name: header.data.patch_name || v,
      publishedAt: header.data.patch_timestamp
        ? new Date(header.data.patch_timestamp * 1000)
        : null,
      parseStatus: nothingUsable ? "failed" : issues.list.length > 0 ? "partial" : "parsed",
      parseIssues: issues.list,
      sections: nothingUsable ? EMPTY_SECTIONS : sections,
    });
  }
}
