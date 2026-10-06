import type { DataOwner } from "@/common/privacy/user-data";
import type { MatchAnnotation } from "./annotations.model";

export interface AnnotationsRepositoryPort {
  find(userId: string, matchId: string): Promise<MatchAnnotation | null>;
  save(annotation: MatchAnnotation): Promise<void>;
  remove(userId: string, matchId: string): Promise<void>;
  tagCounts(userId: string): Promise<Array<{ tag: string; matches: number }>>;
  matchIdsWithTag(userId: string, tag: string): Promise<string[]>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}
