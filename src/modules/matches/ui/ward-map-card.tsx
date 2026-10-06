"use client";

import { useState } from "react";
import { cn } from "cn";
import { plural } from "./format";
import { clockTime } from "../domain/match-laning";
import {
  inWindow,
  MAP_WINDOWS,
  mapPoint,
  type MapEvents,
  type MapWindow,
} from "../domain/match-map";

/** A schematic Dota map (drawn here, not game art): bases, lanes and the river. */
function MapBackdrop() {
  return (
    <g aria-hidden>
      <rect width="100" height="100" rx="3" className="fill-emerald-950/60" />
      {/* River: top-left to bottom-right. */}
      <path d="M0 22 C30 38 62 70 78 100 L90 100 C72 64 40 30 0 12 Z" className="fill-sky-900/50" />
      {/* Lanes. */}
      <path
        d="M6 92 L6 6 L93 6 M8 94 L94 94 L94 8 M9 91 L91 9"
        className="fill-none stroke-amber-100/15"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Bases: Radiant bottom left, Dire top right. */}
      <path d="M0 100 L0 76 Q14 74 24 86 Q26 94 24 100 Z" className="fill-emerald-500/25" />
      <path d="M100 0 L100 24 Q86 26 76 14 Q74 6 76 0 Z" className="fill-rose-500/25" />
      <text x="3" y="97" className="fill-emerald-300/70" fontSize="3.4">
        Radiant
      </text>
      <text x="97" y="5.5" textAnchor="end" className="fill-rose-300/70" fontSize="3.4">
        Dire
      </text>
    </g>
  );
}

/** Where the selected player warded and died (team fights only), from a parsed replay. */
export function WardMapCard({ map, heroLabel }: { map: MapEvents; heroLabel: string }) {
  const [win, setWin] = useState<MapWindow>("all");
  const wards = map.wards.filter((w) => inWindow(w.placedAt, win));
  const deaths = map.teamfightDeaths.filter((d) => inWindow(d.time, win));
  const observers = wards.filter((w) => w.kind === "observer").length;
  const sentries = wards.length - observers;

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="ward-map-title">
      <div>
        <p className="kicker">Parsed replay</p>
        <h2 id="ward-map-title" className="text-lg font-semibold">
          Wards and deaths: {heroLabel}
        </h2>
        <p className="text-xs text-muted-foreground">
          Where wards went down, and deaths during team fights (the replay only records positions
          for those). Schematic map; positions come from OpenDota.
        </p>
      </div>
      <div role="radiogroup" aria-label="Time window" className="flex flex-wrap gap-1.5">
        {MAP_WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            role="radio"
            aria-checked={win === w.key}
            onClick={() => setWin(w.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              win === w.key
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-white/10 text-muted-foreground hover:text-foreground",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,22rem)_1fr]">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={`Map: ${plural(observers, "observer ward")}, ${plural(sentries, "sentry ward")}, ${plural(deaths.length, "team fight death")}`}
          className="aspect-square w-full max-w-[22rem]"
        >
          <MapBackdrop />
          {wards.map((w, i) => {
            const p = mapPoint(w.x, w.y);
            return (
              <circle
                key={`w${i}`}
                cx={p.left * 100}
                cy={p.top * 100}
                r={w.kind === "observer" ? 2.2 : 1.7}
                className={cn(
                  "stroke-black/60",
                  w.kind === "observer" ? "fill-amber-300" : "fill-sky-400",
                )}
                strokeWidth="0.4"
              >
                <title>
                  {`${w.kind === "observer" ? "Observer" : "Sentry"} at ${clockTime(w.placedAt)}${
                    w.removedAt !== null ? `, gone at ${clockTime(w.removedAt)}` : ""
                  }`}
                </title>
              </circle>
            );
          })}
          {deaths.map((d, i) => {
            const p = mapPoint(d.x, d.y);
            const cx = p.left * 100;
            const cy = p.top * 100;
            return (
              <g key={`d${i}`} className="stroke-rose-500" strokeWidth="0.9" strokeLinecap="round">
                <title>{`Died in a team fight starting ${clockTime(d.time)}`}</title>
                <path
                  d={`M${cx - 1.8} ${cy - 1.8} L${cx + 1.8} ${cy + 1.8} M${cx + 1.8} ${cy - 1.8} L${cx - 1.8} ${cy + 1.8}`}
                />
              </g>
            );
          })}
        </svg>
        <div className="space-y-3 text-sm">
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-full bg-amber-300" />
              {plural(observers, "observer ward")}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full bg-sky-400" />
              {plural(sentries, "sentry ward")}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="font-bold text-rose-500">
                ×
              </span>
              {plural(deaths.length, "death")} in team fights
            </li>
          </ul>
          {wards.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Ward timings</summary>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto tabular-nums">
                {wards.map((w, i) => (
                  <li key={i}>
                    {clockTime(w.placedAt)} {w.kind === "observer" ? "Observer" : "Sentry"}
                    {w.removedAt !== null &&
                      ` · lasted ${clockTime(Math.max(0, w.removedAt - w.placedAt))}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
