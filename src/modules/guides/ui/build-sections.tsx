import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { minimapFor } from "@/components/minimap";
import { ZoomableMap } from "@/components/zoomable-map";
import type { ItemInfo } from "@/modules/matches/domain/read-models";
import type { BuildStep, ItemPick } from "../domain/hero-guide";
import { BUILD_STEPS, STARTING_GOLD } from "../domain/hero-guide";
import { talentName, type SkillBuild } from "../domain/skill-build";
import {
  topWardSpots,
  WARD_KINDS,
  WARD_PHASES,
  WARD_SIDES,
  type WardData,
  type WardKind,
  type WardPhase,
  type WardSide,
} from "../domain/ward-spots";

function ItemTile({
  pick,
  itemMap,
  showTiming,
}: {
  pick: ItemPick;
  itemMap: Map<number, ItemInfo>;
  showTiming: boolean;
}) {
  const item = itemMap.get(pick.itemId);
  const name = item?.name ?? `#${pick.itemId}`;
  return (
    <li className="flex w-[4.25rem] flex-col items-center gap-1 text-center">
      <span className="relative block h-[2.6rem] w-[3.6rem] overflow-hidden rounded-md bg-black/30 ring-1 ring-white/[0.08]">
        {item?.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            width={58}
            height={42}
            className="size-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-[0.6rem] text-muted-foreground">
            {name}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-[0.7rem] leading-tight">
        {name}
        {pick.copies && pick.copies > 1 ? (
          <span className="font-semibold text-gold tabular-nums"> ×{pick.copies}</span>
        ) : null}
      </span>
      {showTiming && pick.minute !== undefined && (
        <span className="text-[0.7rem] font-medium text-gold tabular-nums">{pick.minute}′</span>
      )}
    </li>
  );
}

/**
 * The build laid out like Dota's in-game guides: starting items, early items, the core in the
 * order it's bought with its typical and fast timings, the late-game items that fill the
 * inventory, then situational items.
 */
export async function BuildPath({
  build,
  itemMap,
}: {
  build: Record<BuildStep, ItemPick[]>;
  itemMap: Map<number, ItemInfo>;
}) {
  const t = await getT();
  const startCosts = build.start.map((p) => itemMap.get(p.itemId)?.cost ?? null);
  const startGold = startCosts.every((c) => c !== null)
    ? build.start.reduce((n, p, i) => n + (startCosts[i] ?? 0) * (p.copies ?? 1), 0)
    : null;
  const steps = BUILD_STEPS.filter((s) => build[s].length > 0);
  if (steps.length === 0)
    return <p className="text-sm text-muted-foreground">{t("guides.items.noData")}</p>;
  return (
    <div className="space-y-5">
      {/* Two steps a row on wider screens, like the in-game guide's columns: a wide card
          isn't left mostly empty beside a few item icons. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
        {steps.map((step) => (
          <div key={step} role="group" aria-label={t(`guides.build.steps.${step}`)}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold">{t(`guides.build.steps.${step}`)}</h3>
              <p className="text-xs text-muted-foreground">
                {step === "start" && startGold !== null
                  ? t("guides.build.startGold", { gold: startGold, max: STARTING_GOLD })
                  : t(`guides.build.hints.${step}`)}
              </p>
            </div>
            {step === "core" || step === "late" ? (
              <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
                {build[step].map((pick, i) => (
                  <li key={pick.itemId} className="flex items-start gap-1">
                    <ul>
                      <ItemTile pick={pick} itemMap={itemMap} showTiming />
                    </ul>
                    {i < build[step].length - 1 && (
                      <ChevronRight aria-hidden className="mt-3 size-4 text-muted-foreground" />
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="flex flex-wrap gap-x-2 gap-y-3">
                {build[step].map((pick) => (
                  <ItemTile
                    key={pick.itemId}
                    pick={pick}
                    itemMap={itemMap}
                    showTiming={step !== "start"}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {build.core.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="mb-2 text-left text-sm font-semibold">
              {t("guides.build.timings.title")}
            </caption>
            <thead>
              <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-2 font-medium">
                  {t("guides.build.timings.item")}
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  {t("guides.build.timings.fast")}
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  {t("guides.build.timings.typical")}
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">
                  {t("guides.build.timings.win")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {[...build.early, ...build.core, ...build.late].map((p) => (
                <tr key={p.itemId}>
                  <th scope="row" className="py-2 pr-2 text-left font-normal">
                    {itemMap.get(p.itemId)?.name ?? `#${p.itemId}`}
                  </th>
                  <td className="px-2 py-2 text-right font-semibold text-gold tabular-nums">
                    {p.fastMinute !== undefined
                      ? t("guides.items.minute", { n: p.fastMinute })
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {p.minute !== undefined ? t("guides.items.minute", { n: p.minute }) : "—"}
                  </td>
                  <td className="py-2 pl-2 text-right text-muted-foreground tabular-nums">
                    {p.winRate !== undefined ? `${Math.round(p.winRate * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">{t("guides.build.timings.note")}</p>
        </div>
      )}
    </div>
  );
}

/** Skill order by level (like the in-game guide's grid) and the talents pros took. */
export async function SkillBuildCard({
  skills,
  heroLabel,
}: {
  skills: SkillBuild | null;
  heroLabel: string;
}) {
  const t = await getT();
  return (
    <section aria-labelledby="guide-skills" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">{t("guides.skills.kicker")}</p>
        <h2 id="guide-skills" className="text-lg font-semibold">
          {t("guides.skills.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {skills
            ? t("guides.skills.description", { hero: heroLabel, n: skills.games })
            : t("guides.skills.unavailable")}
          {skills?.patch && (
            <>
              {" "}
              {skills.currentPatch && skills.currentPatch !== skills.patch
                ? t("guides.skills.stalePatch", {
                    patch: skills.patch,
                    current: skills.currentPatch,
                  })
                : t("guides.skills.patch", { patch: skills.patch })}
            </>
          )}
        </p>
      </div>
      {skills && (
        <>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-xs">
              <thead>
                <tr>
                  <th scope="col" className="sr-only">
                    {t("guides.skills.ability")}
                  </th>
                  {skills.order.map((_, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="w-7 text-center font-medium text-muted-foreground tabular-nums"
                    >
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skills.abilities.map((a) => (
                  <tr key={a.id}>
                    <th scope="row" className="pr-2 text-left font-normal">
                      <span className="flex items-center gap-2">
                        {a.imageUrl && (
                          <Image
                            src={a.imageUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="size-7 rounded"
                          />
                        )}
                        <span className="max-w-[8rem] truncate">{a.name}</span>
                      </span>
                    </th>
                    {skills.order.map((id, i) => (
                      <td key={i} className="text-center">
                        <span
                          className={cn(
                            "grid size-7 place-items-center rounded",
                            id === a.id ? "bg-gold/80 font-semibold text-black" : "bg-white/[0.04]",
                          )}
                        >
                          {id === a.id ? i + 1 : ""}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {skills.order.some((id) =>
                  skills.talents.some((r) => r.options.some((o) => o.id === id)),
                ) && (
                  <tr>
                    <th scope="row" className="pr-2 text-left font-normal text-muted-foreground">
                      {t("guides.skills.talent")}
                    </th>
                    {skills.order.map((id, i) => {
                      const talent = skills.talents.some((r) => r.options.some((o) => o.id === id));
                      return (
                        <td key={i} className="text-center">
                          <span
                            className={cn(
                              "grid size-7 place-items-center rounded",
                              talent ? "bg-sky-400/70 font-semibold text-black" : "bg-white/[0.04]",
                            )}
                          >
                            {talent ? i + 1 : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {skills.talents.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("guides.skills.talents")}</h3>
              <ul className="space-y-1.5">
                {[...skills.talents].reverse().map((row) => (
                  <li
                    key={row.level}
                    className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-xs sm:gap-2 sm:text-sm"
                  >
                    {row.options.slice(0, 2).map((o, i) => (
                      <span
                        key={o.id}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 sm:px-2.5",
                          i === 0
                            ? "order-1 justify-between"
                            : "order-3 flex-row-reverse justify-between",
                          o.share >= 0.5
                            ? "border-gold/40 bg-gold/10"
                            : "border-white/[0.06] text-muted-foreground",
                        )}
                      >
                        <span className="line-clamp-2 min-w-0 leading-tight">
                          {talentName(o.name)}
                        </span>
                        <span className="text-xs tabular-nums">{Math.round(o.share * 100)}%</span>
                      </span>
                    ))}
                    <span className="order-2 grid size-8 place-items-center rounded-full border border-gold/40 text-xs font-semibold text-gold tabular-nums">
                      {row.level}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{t("guides.skills.talentNote")}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Where wards went in recent pro games, on the map, for one side, phase and kind of ward. */
export async function WardMap({
  data,
  side,
  phase,
  kind,
  hrefFor,
  compact,
}: {
  data: WardData | null;
  side: WardSide;
  phase: WardPhase;
  kind: WardKind;
  hrefFor: (next: { side: WardSide; phase: WardPhase; kind: WardKind }) => string;
  compact?: boolean;
}) {
  const t = await getT();
  const spots = data ? topWardSpots(data.cells, { side, phase, kind }) : [];
  const map = minimapFor(data?.patch);
  const stale =
    data?.patch && data.currentPatch && data.patch !== data.currentPatch
      ? { patch: data.patch, current: data.currentPatch }
      : null;
  const chip = (current: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full border px-3 text-sm",
      current
        ? "border-gold/50 bg-gold/10 text-gold"
        : "border-white/[0.08] text-muted-foreground hover:text-foreground",
    );
  return (
    <section aria-labelledby="guide-wards" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">{t("guides.wards.kicker")}</p>
        <h2 id="guide-wards" className="text-lg font-semibold">
          {t("guides.wards.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {data ? t("guides.wards.description", { n: data.games }) : t("guides.unavailable")}
        </p>
      </div>
      {data && (
        <>
          <div className="flex flex-col gap-2">
            {[
              {
                label: t("guides.wards.kinds.label"),
                options: WARD_KINDS.map((v) => ({
                  key: v,
                  text: t(`guides.wards.kinds.${v}`),
                  href: hrefFor({ side, phase, kind: v }),
                  current: v === kind,
                })),
              },
              {
                label: t("guides.wards.sides.label"),
                options: WARD_SIDES.map((v) => ({
                  key: v,
                  text: t(`guides.wards.sides.${v}`),
                  href: hrefFor({ side: v, phase, kind }),
                  current: v === side,
                })),
              },
              {
                label: t("guides.wards.phases.label"),
                options: WARD_PHASES.map((v) => ({
                  key: v,
                  text: t(`guides.wards.phases.${v}`),
                  href: hrefFor({ side, phase: v, kind }),
                  current: v === phase,
                })),
              },
            ].map((group) => (
              <nav key={group.label} aria-label={group.label} className="flex flex-wrap gap-2">
                {group.options.map((o) => (
                  <Link
                    key={o.key}
                    href={o.href}
                    scroll={false}
                    aria-current={o.current ? "true" : undefined}
                    className={chip(o.current)}
                  >
                    {o.text}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
          <div className={cn("mx-auto w-full", compact ? "max-w-md" : "max-w-2xl")}>
            <ZoomableMap
              className="rounded-lg ring-1 ring-white/[0.08]"
              labels={{
                zoomIn: t("common.map.zoomIn"),
                zoomOut: t("common.map.zoomOut"),
                reset: t("common.map.reset"),
                hint: t("common.map.hint"),
              }}
            >
              <Image
                src={map.src}
                alt={t("guides.wards.mapAlt")}
                fill
                sizes="(max-width: 768px) 100vw, 672px"
                className="pointer-events-none object-cover"
                draggable={false}
              />
              <ol>
                {spots.map((s, i) => (
                  <li
                    key={`${s.left}-${s.top}`}
                    className={cn(
                      "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-semibold text-black ring-2 ring-black/60",
                      kind === "observer" ? "bg-gold" : "bg-sky-400",
                    )}
                    style={{
                      left: `${s.left * 100}%`,
                      top: `${s.top * 100}%`,
                      width: `${1.1 + s.relative * 0.7}rem`,
                      height: `${1.1 + s.relative * 0.7}rem`,
                      fontSize: "0.65rem",
                      // Spots keep their size on screen as the map zooms.
                      scale: "calc(1 / var(--map-zoom, 1))",
                    }}
                    title={t("guides.wards.spotTitle", { rank: i + 1, n: s.count })}
                  >
                    <span aria-hidden>{i + 1}</span>
                    <span className="sr-only">
                      {t("guides.wards.spotTitle", { rank: i + 1, n: s.count })}
                    </span>
                  </li>
                ))}
              </ol>
              {spots.length === 0 && (
                <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">
                  {t("guides.wards.none")}
                </p>
              )}
            </ZoomableMap>
          </div>
          <p className="text-xs text-muted-foreground">
            {stale
              ? t("guides.wards.stalePatch", stale)
              : t("guides.wards.patch", { patch: map.patch })}
          </p>
          <p className="text-xs text-muted-foreground">{t("guides.wards.note")}</p>
        </>
      )}
    </section>
  );
}
