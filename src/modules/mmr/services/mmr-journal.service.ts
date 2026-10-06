import { err, ok, type Result } from "@/common/result";
import type { MmrEntry } from "../domain/mmr-entry";
import type { MmrEntryInput } from "../schemas/mmr-entry.schema";
import type { MmrEntriesPort } from "../mmr.ports";
import type { JournalError, JournalOwner } from "../dtos/responses/mmr.dto";

/** Commands for the signed-in user's own MMR journal. Ownership is enforced in the repository filter. */

export class MmrJournalService {
  private readonly now: () => Date;

  constructor(
    private readonly repo: MmrEntriesPort,
    now?: () => Date,
    /** Needed for "Download your data" and account deletion only. */
    private readonly data?: {
      entries: PersonalData;
      medals: PersonalData;
    },
  ) {
    this.now = now ?? (() => new Date());
  }

  async create(owner: JournalOwner, input: MmrEntryInput): Promise<MmrEntry> {
    const now = this.now();
    return this.repo.create({
      userId: owner.userId,
      accountId32: owner.accountId32,
      observedAt: input.observedAt,
      mmr: input.mmr,
      note: input.note,
      source: "user",
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(
    owner: JournalOwner,
    id: string,
    input: MmrEntryInput,
  ): Promise<Result<MmrEntry, JournalError>> {
    const updated = await this.repo.updateOwned(id, owner.userId, {
      mmr: input.mmr,
      observedAt: input.observedAt,
      note: input.note,
      updatedAt: this.now(),
    });
    return updated ? ok(updated) : err({ type: "not_found" });
  }

  async delete(owner: JournalOwner, id: string): Promise<Result<true, JournalError>> {
    return (await this.repo.deleteOwned(id, owner.userId)) ? ok(true) : err({ type: "not_found" });
  }

  list(owner: JournalOwner, range?: { from?: Date; to?: Date }): Promise<MmrEntry[]> {
    return this.repo.list(owner.userId, owner.accountId32, range);
  }

  /** Your MMR entries and medal history. */
  async exportMyData(owner: JournalOwner) {
    const [entries, medals] = await Promise.all([
      this.data?.entries.exportForOwner(owner) ?? [],
      this.data?.medals.exportForOwner(owner) ?? [],
    ]);
    return { mmrEntries: entries, medalHistory: medals };
  }

  async deleteMyData(owner: JournalOwner) {
    const [entries, medals] = await Promise.all([
      this.data?.entries.deleteForOwner(owner) ?? 0,
      this.data?.medals.deleteForOwner(owner) ?? 0,
    ]);
    return { mmrEntries: entries, medalHistory: medals };
  }
}

interface PersonalData {
  exportForOwner(owner: JournalOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: JournalOwner): Promise<number>;
}
