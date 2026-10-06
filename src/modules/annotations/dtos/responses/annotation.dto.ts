import type { MatchAnnotation } from "../../annotations.model";

/** Your tags and note on a match, as the API and match page show them. */
export interface AnnotationDto {
  tags: string[];
  note: string;
}

export const toAnnotationDto = (a: MatchAnnotation | null): AnnotationDto => ({
  tags: a?.tags ?? [],
  note: a?.note ?? "",
});

export interface TagCountDto {
  tag: string;
  matches: number;
}
