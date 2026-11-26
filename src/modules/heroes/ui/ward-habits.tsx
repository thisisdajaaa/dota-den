"use client";
import { useState } from "react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { ZoomableMap } from "@/components/zoomable-map";
import { StatTile } from "@/components/stat-tile";
import { clockTime } from "@/modules/matches/domain/match-laning";
import {
  inWindow,
  MAP_WINDOWS,
  mapPoint,
  type MapWindow,
} from "@/modules/matches/domain/match-map";
import { MapBackdrop } from "@/modules/matches/ui/ward-map-card";
import { MIN_TIMED_OBSERVERS, type MapWard, type WardHabits } from "../domain/ward-habits";

type KindFilter = "all" | "observer" | "sentry";
type SideFilter = "all" | "radiant" | "dire";

/** A ward destroyed this soon reads as a bad spot: drawn faded. */
const SHORT_LIFE_SEC = 60;

function Choice<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs",
            value === o.key
              ? "border-gold/50 bg-gold/15 text-gold"
              : "border-white/10 text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Your ward habits (tiles) and every ward on one map, with kind, side and time filters. */
export function WardHabitsView({
  habits,
  spots,
  mapImage,
}: {
  habits: WardHabits;
  spots: MapWard[];
  mapImage: string | null;
}) {
  const t = useT();
  const [kind, setKind] = useState<KindFilter>("all");
  const [side, setSide] = useState<SideFilter>("all");
  const [win, setWin] = useState<MapWindow>("all");
  const shown = spots.filter(
    (w) =>
      (kind === "all" || w.kind === kind) &&
      (side === "all" || w.side === side) &&
      inWindow(w.placedAt, win),
  );
  const o = habits.observers;
  const perGame = (n: number | null) => (n === null ? "—" : n.toFixed(1));
  const kindLabel = (k: MapWard["kind"]) =>
    k === "observer" ? t("matches.wardMap.observer") : t("matches.wardMap.sentry");

  return (
    <div className="space-y-6">
      <section
        aria-label={t("heroes.wards.title")}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <StatTile
          label={t("heroes.wards.tiles.observers")}
          value={perGame(o.perGame)}
          detail={t("heroes.wards.tiles.observersDetail", { n: o.placed })}
        />
        <StatTile
          label={t("heroes.wards.tiles.sentries")}
          value={perGame(habits.sentries.perGame)}
          detail={t("heroes.wards.tiles.sentriesDetail", { n: habits.sentries.placed })}
        />
        <StatTile
          label={t("heroes.wards.tiles.life")}
          value={o.avgLifeSec === null ? "—" : clockTime(o.avgLifeSec)}
          detail={
            o.avgLifeSec === null
              ? t("heroes.wards.tiles.lifeFew", { min: MIN_TIMED_OBSERVERS, n: o.timed })
              : t("heroes.wards.tiles.lifeDetail", { n: o.timed })
          }
        />
        <StatTile
          label={t("heroes.wards.tiles.destroyed")}
          value={o.destroyedShare === null ? "—" : `${Math.round(o.destroyedShare * 100)}%`}
          detail={
            o.destroyedShare === null
              ? t("heroes.wards.tiles.lifeFew", { min: MIN_TIMED_OBSERVERS, n: o.timed })
              : t("heroes.wards.tiles.destroyedDetail")
          }
        />
        <StatTile
          label={t("heroes.wards.tiles.first")}
          value={habits.firstObserverSec === null ? "—" : clockTime(habits.firstObserverSec)}
          detail={
            habits.firstObserverSec === null
              ? t("heroes.wards.tiles.firstNone")
              : t("heroes.wards.tiles.firstDetail")
          }
        />
      </section>

      <section aria-labelledby="ward-habits-map" className="panel space-y-4 p-5">
        <div>
          <h2 id="ward-habits-map" className="text-lg font-semibold">
            {t("heroes.wards.map.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("heroes.wards.map.description")}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,34rem)_1fr]">
          <ZoomableMap
            className="w-full max-w-[34rem] rounded-lg"
            labels={{
              zoomIn: t("common.map.zoomIn"),
              zoomOut: t("common.map.zoomOut"),
              reset: t("common.map.reset"),
              hint: t("common.map.hint"),
            }}
          >
            <svg
              viewBox="0 0 100 100"
              role="img"
              aria-label={t("heroes.wards.map.label", { n: shown.length })}
              className="aspect-square size-full"
            >
              {mapImage ? (
                <image href={mapImage} width="100" height="100" preserveAspectRatio="none" />
              ) : (
                <MapBackdrop />
              )}
              {shown.map((w, i) => {
                const p = mapPoint(w.x, w.y);
                const short = w.lifeSec !== null && w.lifeSec < SHORT_LIFE_SEC;
                return (
                  <circle
                    key={i}
                    cx={p.left * 100}
                    cy={p.top * 100}
                    r={w.kind === "observer" ? 1.6 : 1.2}
                    className={cn(
                      "stroke-black/60",
                      w.kind === "observer" ? "fill-amber-300" : "fill-sky-400",
                      short && "opacity-35",
                    )}
                    strokeWidth="0.3"
                  >
                    <title>
                      {t("heroes.wards.map.ward", {
                        kind: kindLabel(w.kind),
                        time: clockTime(w.placedAt),
                      }) +
                        (w.lifeSec !== null
                          ? t("heroes.wards.map.lasted", { time: clockTime(w.lifeSec) })
                          : "")}
                    </title>
                  </circle>
                );
              })}
            </svg>
          </ZoomableMap>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("heroes.wards.map.kind")}</p>
              <Choice
                label={t("heroes.wards.map.kind")}
                value={kind}
                onChange={setKind}
                options={(["all", "observer", "sentry"] as const).map((k) => ({
                  key: k,
                  label: t(`heroes.wards.map.kinds.${k}`),
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("heroes.wards.map.side")}</p>
              <Choice
                label={t("heroes.wards.map.side")}
                value={side}
                onChange={setSide}
                options={(["all", "radiant", "dire"] as const).map((k) => ({
                  key: k,
                  label: t(`heroes.wards.map.sides.${k}`),
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("heroes.wards.map.window")}</p>
              <Choice
                label={t("heroes.wards.map.window")}
                value={win}
                onChange={setWin}
                options={MAP_WINDOWS.map((w) => ({
                  key: w.key,
                  label: t(`matches.wardMap.windows.${w.key}`),
                }))}
              />
            </div>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full bg-amber-300" />
                {t("heroes.wards.map.kinds.observer")}:{" "}
                <span className="tabular-nums">
                  {shown.filter((w) => w.kind === "observer").length}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full bg-sky-400" />
                {t("heroes.wards.map.kinds.sentry")}:{" "}
                <span className="tabular-nums">
                  {shown.filter((w) => w.kind === "sentry").length}
                </span>
              </li>
            </ul>
            {shown.length === 0 && (
              <p role="status" className="text-muted-foreground">
                {t("heroes.wards.map.empty")}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
