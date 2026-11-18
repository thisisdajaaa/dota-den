import Link from "next/link";
import { Medal as MedalIcon } from "lucide-react";
import { SegmentedLinks } from "@/components/segmented-links";
import { getT } from "@/common/i18n/server";
import type { Position } from "../domain/position";
import {
  bracketLabel,
  DEFAULT_BRACKET,
  META_BRACKETS,
  metaUrl,
  type BracketChoice,
  type MetaBracket,
} from "../domain/rank-bracket";

/**
 * The rank-bracket picker for the Meta page, with a line saying which bracket is shown and
 * why (your rank, a shared link, or the default), so low-bracket numbers are never mistaken
 * for pro or high-rank meta. Every option is a link (`?bracket=`), so a view can be shared.
 */
export async function BracketPicker({
  choice,
  position,
}: {
  choice: BracketChoice;
  position: Position | null;
}) {
  const t = await getT();
  const { bracket, reason, yours } = choice;
  const label = (b: MetaBracket) =>
    b === DEFAULT_BRACKET
      ? t("meta.bracket.highRanks", { range: bracketLabel(b) })
      : bracketLabel(b);
  const shown = bracketLabel(bracket);
  return (
    <section aria-labelledby="meta-bracket" className="space-y-2">
      <h2 id="meta-bracket" className="kicker flex items-center gap-1.5">
        <MedalIcon aria-hidden className="size-3.5" /> {t("meta.bracket.title")}
      </h2>
      <SegmentedLinks
        label={t("meta.bracket.label")}
        active={bracket}
        href={(b) => metaUrl(position, b)}
        options={META_BRACKETS.map((b) => ({
          value: b,
          label: b === yours ? `${label(b)} ${t("meta.bracket.you")}` : label(b),
        }))}
      />
      <p className="max-w-3xl text-sm text-muted-foreground">
        {reason === "yours" ? (
          <span className="font-medium text-foreground">
            {t("meta.bracket.yours", { bracket: shown })}
          </span>
        ) : (
          <span className="font-medium text-foreground">
            {t("meta.bracket.showing", { bracket: shown })}
          </span>
        )}{" "}
        {bracket === DEFAULT_BRACKET ? t("meta.bracket.defaultNote") : t("meta.bracket.note")}
        {yours && yours !== bracket && (
          <>
            {" "}
            <Link href={metaUrl(position, yours)} className="font-medium text-gold hover:underline">
              {t("meta.bracket.showYours", { bracket: bracketLabel(yours) })}
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
