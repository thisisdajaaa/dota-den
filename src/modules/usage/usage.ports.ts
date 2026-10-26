import type { DataOwner } from "@/common/privacy/user-data";
import type { Feature, UsageRow } from "./domain/usage";

export interface UsagePort {
  record(feature: Feature, userId: string, at: Date): Promise<void>;
  rowsSince(day: string): Promise<UsageRow[]>;
  exportForOwner(owner: DataOwner): Promise<Array<Record<string, unknown>>>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}
