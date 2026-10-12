import type { ShareKind } from "../../domain/share";

/** A link as its owner sees it (Account page, and after sharing). */
export interface ShareLinkDto {
  slug: string;
  url: string;
  kind: ShareKind;
  ref: string;
  createdAt: Date;
  updatedAt: Date;
}
