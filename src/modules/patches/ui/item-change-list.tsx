import { SafeImage } from "@/components/safe-image";
import type { ItemPatchNotes } from "../domain/patch";
import { steamCdn } from "./cdn";
import { NoteList } from "./note-list";

/** Items and neutral items, with Valve's section headings ("Basic Items", …) kept in order. */
export function ItemChangeList({ items }: { items: ItemPatchNotes[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item, i) => {
        if (item.isGeneralNote) {
          return (
            <div key={`g-${i}`} className="md:col-span-2">
              {item.title && <h3 className="pt-2 text-sm font-semibold text-gold">{item.title}</h3>}
              <NoteList notes={item.notes} className="mt-1" />
            </div>
          );
        }
        const icon = steamCdn(item.iconPath);
        return (
          <article
            key={`${item.itemId}-${i}`}
            className="flex gap-3 rounded-xl border border-white/[0.06] bg-card/60 p-4"
          >
            <span className="relative mt-0.5 h-8 w-11 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-white/10">
              {icon && <SafeImage src={icon} alt="" fill sizes="44px" className="object-cover" />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">
                {item.itemName ?? item.title ?? `Item #${item.itemId}`}
              </h3>
              <NoteList notes={item.notes} className="mt-1" />
            </div>
          </article>
        );
      })}
    </div>
  );
}
