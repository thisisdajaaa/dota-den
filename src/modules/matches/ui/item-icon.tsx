import Image from "next/image";
import { cn } from "cn";
import type { ItemInfo } from "../application/ports";

/** Item icon (88×64 source). Empty slots render as a recessed well. */
export function ItemIcon({
  itemId,
  items,
  size = "md",
  round,
}: {
  itemId: number | null;
  items: Map<number, ItemInfo>;
  size?: "sm" | "md";
  round?: boolean;
}) {
  const item = itemId === null ? undefined : items.get(itemId);
  const box = cn(
    "relative inline-block shrink-0 overflow-hidden bg-black/30 ring-1 ring-white/[0.06]",
    size === "sm" ? "h-5 w-7" : "h-[1.6rem] w-[2.2rem]",
    round ? "rounded-full !w-[1.6rem] !h-[1.6rem]" : "rounded",
  );
  if (itemId === null) return <span className={box} aria-hidden />;
  return (
    <span className={box} title={item?.name ?? `Item #${itemId}`}>
      {item?.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          // Match the box (sm 28×20, md 35×26, round 26×26) so the browser picks 1x/2x.
          width={round ? 26 : size === "sm" ? 28 : 35}
          height={round ? 26 : size === "sm" ? 20 : 26}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="grid size-full place-items-center text-[0.5rem] text-muted-foreground">
          #{itemId}
        </span>
      )}
    </span>
  );
}
