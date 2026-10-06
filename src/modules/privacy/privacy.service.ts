import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { exportFile, type ExportFile, type ExportFormat } from "./domain/export-file";
import type { PersonalDataPart } from "./privacy.ports";

/** "Download your data" and "Delete my account", across every feature that keeps data. */
export class PrivacyService {
  constructor(
    private readonly deps: {
      /** Every feature with personal data, except identity. */
      parts: readonly PersonalDataPart[];
      /** The account itself: exported first, deleted last. */
      identity: PersonalDataPart;
      logger: Pick<Logger, "info">;
      now?: () => Date;
    },
  ) {}

  /** Everything Dota Den keeps about you, as one JSON-ready object. */
  async exportAll(owner: DataOwner): Promise<Record<string, unknown>> {
    const { identity, parts } = this.deps;
    const exported = await Promise.all([identity, ...parts].map((p) => p.exportMyData(owner)));
    return {
      exportedAt: this.now().toISOString(),
      note: "Everything Dota Den stores about you. Matches are public OpenDota data imported for you.",
      ...Object.assign({}, ...exported),
    };
  }

  async exportAsFile(owner: DataOwner, format: ExportFormat): Promise<ExportFile> {
    return exportFile(await this.exportAll(owner), format, this.now().toISOString().slice(0, 10));
  }

  /**
   * Deletes your account and everything stored about you. Friend-room drafts are shared, so
   * they're anonymised instead. Identity last: the account goes only once the rest is gone.
   */
  async deleteAll(owner: DataOwner): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const part of this.deps.parts) Object.assign(counts, await part.deleteMyData(owner));
    Object.assign(counts, await this.deps.identity.deleteMyData(owner));
    this.deps.logger.info("account_deleted", { counts });
    return counts;
  }

  private now() {
    return this.deps.now?.() ?? new Date();
  }
}
