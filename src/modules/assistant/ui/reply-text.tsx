import { Fragment, type ReactNode } from "react";

/**
 * Den's replies, lightly formatted: paragraphs, "-" or "1." lists and **bold**. Nothing else
 * from the text is interpreted (no links, no HTML): it all ends up as React text.
 */
export type ReplyBlock =
  { kind: "p"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.*)$/;
/** A markdown heading the model slipped in: shown as a bold line. */
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function replyBlocks(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1]!;
      const last = blocks.at(-1);
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (line.trim() === "") {
      flush();
    } else {
      const heading = HEADING.exec(line);
      para.push(heading ? `**${heading[1]!.replace(/\*\*/g, "")}**` : line);
    }
  }
  flush();
  return blocks;
}

/** **bold** spans; a stray "**" with no partner is shown as written. */
export function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+?\*\*)/g);
  return parts.map((part, i) =>
    /^\*\*[^*\n]+\*\*$/.test(part) ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function ReplyText({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      {replyBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="whitespace-pre-line">
            {inline(b.text)}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="space-y-1 pl-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-gold/70"
                />
                <span className="min-w-0">{inline(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="space-y-1 pl-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2">
                <span className="w-4 shrink-0 text-right font-semibold text-gold tabular-nums">
                  {j + 1}.
                </span>
                <span className="min-w-0">{inline(item)}</span>
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
