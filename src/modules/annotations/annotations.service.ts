import type { DataOwner } from "@/common/privacy/user-data";
import { normalizeTags } from "./domain/annotation";
import type { MatchAnnotation } from "./annotations.model";
import type { AnnotationsRepositoryPort } from "./annotations.ports";
import { toAnnotationDto, type AnnotationDto } from "./dtos/responses/annotation.dto";
import type { SaveAnnotationDto } from "./dtos/requests/save-annotation.dto";

/** Private tags and notes on your matches. */
export class AnnotationsService {
  constructor(private readonly deps: { repository: AnnotationsRepositoryPort; now?: () => Date }) {}

  async get(userId: string, matchId: string): Promise<AnnotationDto> {
    return toAnnotationDto(await this.deps.repository.find(userId, matchId));
  }

  /** Saves your tags (normalised) and note; clearing both removes the annotation. */
  async save(owner: DataOwner, matchId: string, input: SaveAnnotationDto): Promise<AnnotationDto> {
    const annotation: MatchAnnotation = {
      userId: owner.userId,
      accountId32: owner.accountId32,
      matchId,
      tags: normalizeTags(input.tags),
      note: input.note.trim(),
      updatedAt: this.deps.now?.() ?? new Date(),
    };
    if (annotation.tags.length === 0 && annotation.note === "")
      await this.deps.repository.remove(owner.userId, matchId);
    else await this.deps.repository.save(annotation);
    return toAnnotationDto(annotation);
  }

  tagCounts(userId: string) {
    return this.deps.repository.tagCounts(userId);
  }

  matchIdsWithTag(userId: string, tag: string) {
    return this.deps.repository.matchIdsWithTag(userId, tag);
  }

  async exportMyData(owner: DataOwner) {
    return { matchNotes: await this.deps.repository.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { matchNotes: await this.deps.repository.deleteForOwner(owner) };
  }
}
