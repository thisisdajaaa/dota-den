import type { DataOwner } from "@/common/privacy/user-data";

/** A feature that keeps data about a player: it can export it and delete it. */
export interface PersonalDataPart {
  exportMyData(owner: DataOwner): Promise<object>;
  deleteMyData(owner: DataOwner): Promise<Record<string, number>>;
}
