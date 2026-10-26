import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { summarizeUsage, usageDay, type Feature, type FeatureUsage } from "./domain/usage";
import type { UsagePort } from "./usage.ports";

const DAY = 86_400_000;

/** Counts uses of the paid and AI features (admin page), and nothing else about them. */
export class UsageService {
  constructor(
    private readonly deps: {
      repository: UsagePort;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /** Counts one use. Never fails the feature: a counter that can't be written is skipped. */
  async record(feature: Feature, userId: string): Promise<void> {
    await this.deps.repository.record(feature, userId, this.now()).catch((error: unknown) => {
      this.deps.logger.warn("usage_record_failed", { feature, error });
    });
  }

  /** Uses and players per feature, last 7 and 30 days. */
  async summary(): Promise<FeatureUsage[]> {
    const now = this.now();
    const rows = await this.deps.repository.rowsSince(usageDay(new Date(now.getTime() - 30 * DAY)));
    return summarizeUsage(rows, now);
  }

  async exportMyData(owner: DataOwner) {
    return { featureUsage: await this.deps.repository.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { featureUsage: await this.deps.repository.deleteForOwner(owner) };
  }
}
