import Link from "next/link";
import { SegmentedLinks } from "@/components/segmented-links";
import { POSITIONS, POSITION_INFO, type Position } from "../domain/position";

export const metaHref = (p: Position) => `/meta?pos=${p}`;

/** Tabs to switch position; the user's own position is marked. */
export function RoleTabs({ active, yours }: { active: Position; yours: Position | null }) {
  return (
    <SegmentedLinks
      label="Position"
      active={String(active)}
      href={(v) => metaHref(Number(v) as Position)}
      options={POSITIONS.map((p) => ({
        value: String(p),
        label: `${POSITION_INFO[p].short} · ${POSITION_INFO[p].name}${p === yours ? " (you)" : ""}`,
      }))}
    />
  );
}

/** Big role picker for when we don't know the position yet. */
export function RolePicker() {
  return (
    <nav aria-label="Choose your role" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {POSITIONS.map((p) => {
        const info = POSITION_INFO[p];
        return (
          <Link
            key={p}
            href={metaHref(p)}
            className="panel group flex flex-col gap-1 p-4 transition-colors hover:bg-white/[0.03]"
          >
            <span className="font-display text-2xl font-bold text-gold">{p}</span>
            <span className="font-medium group-hover:text-gold">{info.name}</span>
            <span className="text-xs text-muted-foreground">
              {info.side === "core" ? "Core" : "Support"}, {info.laneName}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
