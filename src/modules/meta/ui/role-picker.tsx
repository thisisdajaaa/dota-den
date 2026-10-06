import Link from "next/link";
import { SegmentedLinks } from "@/components/segmented-links";
import { getT } from "@/common/i18n/server";
import { POSITIONS, POSITION_INFO, type Position } from "../domain/position";

export const metaHref = (p: Position) => `/meta?pos=${p}`;

/** Tabs to switch position; the user's own position is marked. */
export async function RoleTabs({ active, yours }: { active: Position; yours: Position | null }) {
  const t = await getT();
  return (
    <SegmentedLinks
      label={t("meta.roles.tabsLabel")}
      active={String(active)}
      href={(v) => metaHref(Number(v) as Position)}
      options={POSITIONS.map((p) => ({
        value: String(p),
        label: `${POSITION_INFO[p].short} · ${POSITION_INFO[p].name}${p === yours ? ` ${t("meta.roles.you")}` : ""}`,
      }))}
    />
  );
}

/** Big role picker for when we don't know the position yet. */
export async function RolePicker() {
  const t = await getT();
  return (
    <nav
      aria-label={t("meta.roles.chooseRole")}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
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
              {info.side === "core" ? t("meta.roles.core") : t("meta.roles.support")},{" "}
              {info.laneName}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
