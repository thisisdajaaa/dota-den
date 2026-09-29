import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/modules/shared/infrastructure/provider-gateway";
import type { PatchReferences, ReferenceEntry } from "../domain/patch";
import type { PatchReferenceCatalog, ProviderError } from "../application/ports";

export const OPENDOTA_BASE_URL = "https://api.opendota.com/api";

const IdsSchema = z.record(z.string(), z.string());
const ConstantsSchema = z.record(
  z.string(),
  z.object({ dname: z.string().optional(), img: z.string().optional() }),
);

/** Only Dota CDN image paths are kept (matches next.config remotePatterns). */
export function dotaIconPath(path: string | undefined): string | null {
  if (!path) return null;
  const clean = path.replace(/\?.*$/, "");
  if (clean.includes("..")) return null;
  return /^\/apps\/dota2\/[\w./-]+\.png$/.test(clean) ? clean : null;
}

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

function join(
  ids: Record<string, string>,
  constants: z.infer<typeof ConstantsSchema>,
): Map<number, ReferenceEntry> {
  const out = new Map<number, ReferenceEntry>();
  for (const [id, key] of Object.entries(ids)) {
    const n = Number(id);
    if (!Number.isSafeInteger(n)) continue;
    const c = constants[key];
    out.set(n, {
      key,
      // Some constants have an empty display name; never invent one from the key.
      name: c?.dname?.trim() || null,
      iconPath: dotaIconPath(c?.img),
    });
  }
  return out;
}

/** Ability and item id → key/name/icon from OpenDota's constants (cached for a day). */
export class OpenDotaPatchReferenceCatalog implements PatchReferenceCatalog {
  /** Parsed maps for the last set of (gateway-cached) bodies; avoids re-validating ~2MB. */
  private memo: { bodies: unknown[]; value: PatchReferences } | null = null;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { apiKey?: string; baseUrl?: string } = {},
  ) {}

  private url(path: string): string {
    const url = new URL(`${this.opts.baseUrl ?? OPENDOTA_BASE_URL}${path}`);
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    return url.toString();
  }

  async getReferences(): Promise<Result<PatchReferences, ProviderError>> {
    const ttl = { cacheTtlMs: 24 * 60 * 60 * 1000 };
    const responses = await Promise.all(
      ["ability_ids", "abilities", "item_ids", "items"].map((c) =>
        this.gateway.getJson(this.url(`/constants/${c}`), ttl),
      ),
    );
    for (const res of responses) if (!res.ok) return err(toProviderError(res));
    const bodies = responses.map((r) => (r.ok ? r.body : null));
    if (this.memo && this.memo.bodies.every((b, n) => b === bodies[n])) return ok(this.memo.value);
    const [abilityIds, abilities, itemIds, items] = bodies;

    const a = IdsSchema.safeParse(abilityIds);
    const ac = ConstantsSchema.safeParse(abilities);
    const i = IdsSchema.safeParse(itemIds);
    const ic = ConstantsSchema.safeParse(items);
    if (!a.success || !ac.success || !i.success || !ic.success)
      return err({ type: "invalid_payload", cause: "reference constants" });

    const value = { abilities: join(a.data, ac.data), items: join(i.data, ic.data) };
    this.memo = { bodies, value };
    return ok(value);
  }
}
