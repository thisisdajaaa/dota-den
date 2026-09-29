import { cn } from "cn";
import type { PatchNote } from "../domain/patch";

/** Valve's notes rendered verbatim, keeping indentation, sub-headings and Aghanim's tags. */
export function NoteList({ notes, className }: { notes: PatchNote[]; className?: string }) {
  if (notes.length === 0) return null;
  return (
    <ul className={cn("space-y-1 text-sm leading-relaxed", className)}>
      {notes.map((n, i) =>
        n.subtitle ? (
          <li
            key={i}
            className="pt-2 text-xs font-semibold tracking-wider text-gold/90 uppercase first:pt-0"
          >
            {n.text}
          </li>
        ) : (
          <li
            key={i}
            className={cn("relative whitespace-pre-line text-foreground/90", n.bullet && "pl-4")}
            style={{ marginLeft: `${Math.max(0, n.indentLevel - 1) * 1.1}rem` }}
          >
            {n.bullet && (
              <span
                aria-hidden
                className="absolute top-[0.6em] left-1 size-1 rounded-full bg-muted-foreground"
              />
            )}
            {n.aghanims && (
              <span className="mr-1.5 inline-flex rounded border border-sky-400/30 bg-sky-400/10 px-1 text-[0.6rem] font-semibold tracking-wide text-sky-300 uppercase">
                {n.aghanims === "scepter" ? "Scepter" : "Shard"}
              </span>
            )}
            {n.text}
            {n.info && <span className="mt-0.5 block text-xs text-muted-foreground">{n.info}</span>}
          </li>
        ),
      )}
    </ul>
  );
}
