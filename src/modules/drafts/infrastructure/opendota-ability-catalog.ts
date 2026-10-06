import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { AbilityCatalog } from "../drafts.ports";
import { abilityTags, briefDescription, type HeroKit } from "../domain/draft-review";

const DAY_MS = 24 * 3_600_000;
const MAX_ABILITIES = 6;

const HeroesSchema = z.record(
  z.string(),
  z.object({ id: z.number().int(), name: z.string() }).passthrough(),
);
const HeroAbilitiesSchema = z.record(
  z.string(),
  z.object({ abilities: z.array(z.string()) }).passthrough(),
);
const AbilitiesSchema = z.record(
  z.string(),
  z
    .object({
      dname: z.string().optional(),
      desc: z.unknown().optional(),
      behavior: z.unknown().optional(),
      dmg_type: z.unknown().optional(),
      bkbpierce: z.unknown().optional(),
      target_team: z.unknown().optional(),
    })
    .passthrough(),
);

/** Current-patch hero abilities from OpenDota's constants (the game files). */
export class OpenDotaAbilityCatalog implements AbilityCatalog {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl: string; apiKey?: string },
  ) {}

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const url = new URL(`${this.opts.baseUrl}${path}`);
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    const res = await this.gateway.getJson(url.toString(), { cacheTtlMs: DAY_MS });
    if (!res.ok) return null;
    const parsed = schema.safeParse(res.body);
    return parsed.success ? parsed.data : null;
  }

  async kits(heroIds: readonly number[]): Promise<Map<number, HeroKit>> {
    const [heroes, heroAbilities, abilities] = await Promise.all([
      this.get("/constants/heroes", HeroesSchema),
      this.get("/constants/hero_abilities", HeroAbilitiesSchema),
      this.get("/constants/abilities", AbilitiesSchema),
    ]);
    const kits = new Map<number, HeroKit>();
    if (!heroes || !heroAbilities || !abilities) return kits;
    const keyById = new Map(Object.values(heroes).map((h) => [h.id, h.name]));
    for (const heroId of heroIds) {
      const key = keyById.get(heroId);
      const list = key ? heroAbilities[key]?.abilities : undefined;
      if (!list) continue;
      const briefs = list
        .map((k) => abilities[k])
        .filter((a) => a?.dname && !String(a.behavior ?? "").includes("Hidden"))
        .slice(0, MAX_ABILITIES)
        .map((a) => ({ name: a.dname!, desc: briefDescription(a.desc), tags: abilityTags(a) }));
      if (briefs.length) kits.set(heroId, { heroId, abilities: briefs });
    }
    return kits;
  }
}
