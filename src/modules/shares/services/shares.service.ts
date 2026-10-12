import type { DataOwner } from "@/common/privacy/user-data";
import { isEmpty, SLUG_PATTERN, type ShareSnapshot } from "../domain/share";
import type { ShareDocument } from "../shares.model";
import type { ShareRequest, ShareSources, SharesRepositoryPort } from "../shares.ports";

export type ShareError = { type: "not_found" } | { type: "empty" };

export type ShareResult = { ok: true; value: ShareDocument } | { ok: false; error: ShareError };

/** Creates, lists and removes a player's share links. */
export class SharesService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      repository: SharesRepositoryPort;
      sources: ShareSources;
      /** A fresh unguessable slug. */
      newSlug: () => string;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async share(owner: DataOwner, request: ShareRequest, timeZone: string): Promise<ShareResult> {
    let snapshot: ShareSnapshot | null;
    let ref: string;
    if (request.kind === "session") {
      snapshot = await this.deps.sources.session(owner, request.ref);
      ref = request.ref;
    } else {
      const week = await this.deps.sources.week(owner, timeZone);
      snapshot = week;
      ref = week.from;
    }
    if (!snapshot) return { ok: false, error: { type: "not_found" } };
    if (isEmpty(snapshot)) return { ok: false, error: { type: "empty" } };
    const playerName = await this.deps.sources.playerName(owner.accountId32).catch(() => null);
    const doc = await this.deps.repository.upsert(
      { userId: owner.userId, kind: snapshot.kind, ref, playerName, snapshot },
      this.deps.newSlug(),
      this.now(),
    );
    return { ok: true, value: doc };
  }

  /** The public view of a link; null for anything that isn't a live link. */
  async view(slug: string): Promise<ShareDocument | null> {
    if (!SLUG_PATTERN.test(slug)) return null;
    return this.deps.repository.find(slug);
  }

  list(userId: string) {
    return this.deps.repository.listForUser(userId);
  }

  revoke(userId: string, slug: string) {
    return this.deps.repository.remove(userId, slug);
  }

  async exportMyData(owner: DataOwner) {
    return { shares: await this.deps.repository.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { shares: await this.deps.repository.deleteForOwner(owner) };
  }
}
