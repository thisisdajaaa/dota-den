import type {
  PatchReferenceCatalog,
  PatchRefreshState,
  PatchRefreshStateRepository,
  PatchRepository,
  StoredPatchState,
} from "@/modules/patches/application/ports";
import type { Patch } from "@/modules/patches/domain/patch";
import { ValvePatchAdapter } from "@/modules/patches/infrastructure/valve-patch-adapter";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { err, ok } from "@/modules/shared/domain/result";
import { PATCH_LIST, patchDetail } from "../fixtures/valve-patches";

/**
 * A real ValvePatchAdapter over a scripted fetch. Mutate `details` / `status` between calls
 * to simulate upstream changes or outages.
 */
export function scriptedValve() {
  const state = {
    list: PATCH_LIST as unknown,
    details: new Map<string, unknown>(),
    status: 200,
    calls: [] as string[],
  };
  for (const p of PATCH_LIST.patches) {
    state.details.set(
      p.patch_number,
      patchDetail(p.patch_number, { patch_timestamp: p.patch_timestamp }),
    );
  }
  const fetch = async (url: string): Promise<Response> => {
    const u = new URL(url);
    state.calls.push(u.pathname + u.search);
    if (state.status !== 200) return new Response("{}", { status: state.status });
    const body = u.pathname.endsWith("patchnoteslist")
      ? state.list
      : (state.details.get(u.searchParams.get("version") ?? "") ?? {
          success: false,
          message: "Can't find patch notes",
        });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const gateway = new ProviderGateway({
    name: "valve",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { adapter: new ValvePatchAdapter(gateway), state };
}

export function fakeReferences(available = true): PatchReferenceCatalog & { available: boolean } {
  return {
    available,
    async getReferences() {
      if (!this.available) return err({ type: "unavailable", cause: "test" });
      return ok({
        abilities: new Map([
          [5003, { key: "antimage_mana_break", name: "Mana Break", iconPath: null }],
        ]),
        items: new Map([[1, { key: "blink", name: "Blink Dagger", iconPath: null }]]),
      });
    },
  };
}

export class InMemoryPatchRepository implements PatchRepository {
  readonly docs = new Map<string, Patch>();
  writes = 0;

  async getState(version: string): Promise<StoredPatchState | null> {
    const p = this.docs.get(version);
    return p
      ? {
          version,
          contentHash: p.contentHash,
          parseStatus: p.parseStatus,
          parseRevision: p.parseRevision,
          parserVersion: p.parserVersion,
          referencesResolved: p.referencesResolved,
        }
      : null;
  }

  async insert(patch: Patch): Promise<"inserted" | "conflict"> {
    if (this.docs.has(patch.version)) return "conflict";
    this.writes++;
    this.docs.set(patch.version, patch);
    return "inserted";
  }

  async replace(patch: Patch, expectedRevision: number): Promise<"updated" | "conflict"> {
    if (this.docs.get(patch.version)?.parseRevision !== expectedRevision) return "conflict";
    this.writes++;
    this.docs.set(patch.version, patch);
    return "updated";
  }

  async count(): Promise<number> {
    return this.docs.size;
  }
}

export class InMemoryRefreshState implements PatchRefreshStateRepository {
  state: PatchRefreshState | null = null;

  async get(): Promise<PatchRefreshState | null> {
    return this.state;
  }

  async tryClaim(now: Date, minIntervalMs: number): Promise<boolean> {
    const last = this.state?.lastAttemptAt;
    if (last && now.getTime() - last.getTime() < minIntervalMs) return false;
    this.state = { lastSuccessAt: this.state?.lastSuccessAt ?? null, lastAttemptAt: now };
    return true;
  }

  async recordSuccess(now: Date): Promise<void> {
    this.state = { lastAttemptAt: this.state?.lastAttemptAt ?? now, lastSuccessAt: now };
  }
}
