"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import Image from "next/image";
import { heroThumb } from "@/modules/matches/ui/hero-image";
import type { PickSuggestion, Position } from "../domain/pick-for-me";
import type { PickForMeResult } from "../dtos/responses/pick-for-me.dto";
import { HeroGrid } from "./hero-grid";
import type { DraftHero } from "./types";

type Slot = "enemies" | "allies" | "bans";
const MAX: Record<Slot, number> = { enemies: 5, allies: 4, bans: 24 };
const POSITIONS: Position[] = [1, 2, 3, 4, 5];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

/**
 * "Pick for me" during a real ranked draft: add the enemy picks (and your team's, and bans),
 * choose your position, and your own heroes are ranked against them as you go.
 */
export function PickForMe({ heroes }: { heroes: DraftHero[] }) {
  const t = useT();
  const [slots, setSlots] = useState<Record<Slot, number[]>>({ enemies: [], allies: [], bans: [] });
  const [adding, setAdding] = useState<Slot>("enemies");
  const [position, setPosition] = useState<Position | null>(null);
  const [result, setResult] = useState<PickForMeResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const byId = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const taken = useMemo(() => new Set([...slots.enemies, ...slots.allies, ...slots.bans]), [slots]);

  // Ask again whenever the draft or the position changes (the latest answer wins).
  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await apiRequest<PickForMeResult>("/api/v1/drafts/pick-for-me", {
          method: "POST",
          body: { ...slots, position },
        });
        if (id === request.current) {
          setResult(res);
          setProblem(null);
        }
      } catch (e) {
        if (id === request.current)
          setProblem(e instanceof ApiClientError ? e.message : t("drafts.pick.offline"));
      } finally {
        if (id === request.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [slots, position, t]);

  const add = (heroId: number) =>
    setSlots((s) =>
      s[adding].length >= MAX[adding] ? s : { ...s, [adding]: [...s[adding], heroId] },
    );
  const remove = (slot: Slot, heroId: number) =>
    setSlots((s) => ({ ...s, [slot]: s[slot].filter((id) => id !== heroId) }));
  const name = (id: number) => byId.get(id)?.name ?? t("drafts.pick.heroFallback", { id });

  return (
    // Phones: the draft, then the picks, then the hero grid (no scrolling past the grid after
    // every pick). Wide screens: the picks stay beside both.
    <div className="grid gap-4 [grid-template-areas:'draft'_'results'_'heroes'] lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-5 lg:[grid-template-areas:'draft_results'_'heroes_results']">
      <section
        className="panel min-w-0 space-y-4 p-4 [grid-area:draft]"
        aria-label={t("drafts.pick.draftLabel")}
      >
        {(["enemies", "allies", "bans"] as const).map((slot) => (
          <div key={slot} className="space-y-2">
            <button
              type="button"
              onClick={() => setAdding(slot)}
              aria-pressed={adding === slot}
              className={cn(
                "flex min-h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-sm",
                adding === slot
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-white/[0.08] text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="font-medium">{t(`drafts.pick.slots.${slot}`)}</span>
              <span className="text-xs">
                {adding === slot ? t("drafts.pick.adding") : `${slots[slot].length} / ${MAX[slot]}`}
              </span>
            </button>
            {slots[slot].length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t(`drafts.pick.slots.${slot}`)}>
                {slots[slot].map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => remove(slot, id)}
                      aria-label={t("drafts.pick.remove", { hero: name(id) })}
                      className="flex min-h-10 items-center gap-2 rounded-full border border-white/[0.08] py-1 pr-2.5 pl-1 text-sm hover:border-loss/50"
                    >
                      <Thumb hero={byId.get(id)} width={40} />
                      {name(id)}
                      <X aria-hidden className="size-3.5 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="space-y-2">
          <p className="text-sm font-medium" id="pick-position">
            {t("drafts.pick.position")}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pick-position">
            {[null, ...POSITIONS].map((p) => (
              <button
                key={p ?? "any"}
                type="button"
                aria-pressed={position === p}
                onClick={() => setPosition(p)}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-sm",
                  position === p
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-white/[0.08] text-muted-foreground hover:text-foreground",
                )}
              >
                {p === null ? t("drafts.pick.any") : t("drafts.pick.pos", { n: p })}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="min-w-0 [grid-area:heroes]">
        <HeroGrid
          heroes={heroes}
          unavailable={taken}
          disabled={slots[adding].length >= MAX[adding]}
          actionLabel={t(`drafts.pick.addTo.${adding}`)}
          onChoose={add}
        />
      </div>

      <section
        aria-labelledby="pick-results"
        aria-busy={busy}
        className="panel h-fit space-y-4 p-5 [grid-area:results] lg:sticky lg:top-4"
      >
        <div>
          <p className="kicker flex items-center gap-1.5">
            <Sparkles aria-hidden className="size-3.5" /> {t("drafts.pick.panelKicker")}
          </p>
          <h2 id="pick-results" className="text-lg font-semibold">
            {t("drafts.pick.resultsTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("drafts.pick.how")}</p>
        </div>
        {problem ? (
          <p role="alert" className="text-sm text-loss">
            {problem}
          </p>
        ) : !result ? (
          <p className="text-sm text-muted-foreground">{t("drafts.pick.loading")}</p>
        ) : result.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {result.poolSize === 0 ? t("drafts.pick.noPool") : t("drafts.pick.none")}
          </p>
        ) : (
          <>
            <ol className="space-y-3">
              {result.suggestions.map((s, i) => (
                <Suggestion
                  key={s.heroId}
                  s={s}
                  rank={i + 1}
                  name={name}
                  hero={byId.get(s.heroId)}
                />
              ))}
            </ol>
            {result.locked > 0 && (
              <p className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm">
                {plural(t, "drafts.pick.locked", result.locked)}{" "}
                <Link href="/plus" className="font-medium text-gold hover:underline">
                  {t("drafts.pick.plusCta")}
                </Link>
              </p>
            )}
          </>
        )}
        {result && !result.sources.highRank && (
          <p className="text-xs text-muted-foreground">{t("drafts.pick.noHighRank")}</p>
        )}
      </section>
    </div>
  );
}

function Suggestion({
  s,
  rank,
  name,
  hero,
}: {
  s: PickSuggestion;
  rank: number;
  name: (id: number) => string;
  hero: DraftHero | undefined;
}) {
  const t = useT();
  const chip = (key: string, good: boolean, text: string) => (
    <li
      key={key}
      className={cn(
        "rounded px-1.5 py-0.5 text-xs tabular-nums",
        good ? "bg-win/10 text-win" : "bg-loss/10 text-loss",
      )}
    >
      {text}
    </li>
  );
  return (
    <li className="space-y-2 rounded-lg border border-white/[0.06] p-3">
      <div className="flex items-center gap-3">
        <span className="w-4 text-sm text-muted-foreground tabular-nums">{rank}</span>
        <Thumb hero={hero} width={64} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name(s.heroId)}</span>
          <span className="block text-xs text-muted-foreground">
            {t("drafts.pick.you", {
              rate: pct(s.you.wins / s.you.games),
              games: plural(t, "drafts.pick.games", s.you.games),
            })}
            {s.positionShare !== null &&
              ` · ${t("drafts.pick.played", { share: pct(s.positionShare) })}`}
          </span>
        </span>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            s.score >= 0 ? "text-win" : "text-loss",
          )}
          title={t("drafts.pick.scoreTitle")}
        >
          {signed(s.score)}
        </span>
      </div>
      {(s.counters.length > 0 || s.allies.length > 0) && (
        <ul className="flex flex-wrap gap-1.5">
          {s.counters.map((e) =>
            chip(
              `vs-${e.heroId}`,
              e.points >= 0,
              t("drafts.pick.vs", { hero: name(e.heroId), points: signed(e.points) }),
            ),
          )}
          {s.allies.map((e) =>
            chip(
              `with-${e.heroId}`,
              e.points >= 0,
              t("drafts.pick.with", { hero: name(e.heroId), points: signed(e.points) }),
            ),
          )}
        </ul>
      )}
    </li>
  );
}

/** A hero's landscape thumbnail (the draft grid's images), or its initials. */
function Thumb({ hero, width }: { hero: DraftHero | undefined; width: number }) {
  const height = Math.round((width * 9) / 16);
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded bg-white/[0.06]"
      style={{ width, height }}
    >
      {hero?.imageUrl ? (
        <Image
          src={heroThumb(hero.imageUrl, width)}
          alt=""
          width={width}
          height={height}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="grid h-full place-items-center text-[0.55rem] text-muted-foreground">
          {hero?.name.slice(0, 3) ?? "?"}
        </span>
      )}
    </span>
  );
}
