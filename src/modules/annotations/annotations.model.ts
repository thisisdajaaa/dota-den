export const ANNOTATIONS_COLLECTION = "match_annotations";

/** Your tags and note on one of your matches. */
export interface MatchAnnotation {
  userId: string;
  accountId32: number;
  matchId: string;
  tags: string[];
  note: string;
  updatedAt: Date;
}

/** Stored as `match_annotations`, one document per user and match. */
export interface MatchAnnotationDocument extends MatchAnnotation {
  /** `${userId}:${matchId}` */
  _id: string;
}

export const annotationId = (userId: string, matchId: string) => `${userId}:${matchId}`;
