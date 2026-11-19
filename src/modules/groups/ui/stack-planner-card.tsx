"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Copy, Loader2, Send, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { apiRequest, errorMessage } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { MAX_STACK, MIN_STACK, PLANNER_WINDOW_DAYS } from "../domain/stack-planner";
import type { GroupMemberDto } from "../dtos/responses/groups.dto";
import type { PlannerContextDto, StackPlanDto } from "../dtos/responses/stack-planner.dto";
import {
  comboText,
  howItWorks,
  planNotes,
  planText,
  posLabel,
  roleLabel,
  slotEvidence,
  wl,
} from "./stack-plan-text";

type Member = Pick<GroupMemberDto, "accountId32" | "name" | "avatarUrl" | "you">;

/**
 * Tonight's best lineup: tick who's in, then positions (and, with Plus, heroes) from real
 * games, each with its evidence. Nothing loads until asked, to go easy on OpenDota.
 */
export function StackPlannerCard({
  groupId,
  groupName,
  members,
  context,
}: {
  groupId: string;
  groupName: string;
  members: Member[];
  context: PlannerContextDto;
}) {
  const t = useT();
  const [picked, setPicked] = useState<number[]>(context.defaultIn);
  const [plan, setPlan] = useState<StackPlanDto | null>(null);
  const [planFor, setPlanFor] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.accountId32, m])), [members]);
  const nameOf = (id: number) => displayName(byId.get(id)?.name ?? null, id);
  const playing = new Set(context.playing);
  const ready = picked.length >= MIN_STACK && picked.length <= MAX_STACK;
  const full = picked.length >= MAX_STACK;

  function toggle(id: number, on: boolean) {
    setPicked((prev) => (on ? [...prev, id] : prev.filter((p) => p !== id)));
  }

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const ids = [...picked].sort((a, b) => a - b);
      const res = await apiRequest<StackPlanDto>(
        `/api/v1/groups/${groupId}/planner?members=${ids.join(",")}`,
      );
      setPlan(res);
      setPlanFor(ids);
    } catch (e) {
      setError(errorMessage(e, t("groups.planner.failed")));
    } finally {
      setBusy(false);
    }
  }

  const text = plan ? planText(t, plan, nameOf, groupName) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("groups.planner.copied"));
    } catch {
      toast.error(t("groups.planner.copyFailed"));
    }
  }

  async function post() {
    setPosting(true);
    try {
      await apiRequest(`/api/v1/groups/${groupId}/planner/discord`, {
        method: "POST",
        body: { members: planFor },
      });
      toast.success(t("groups.planner.discordPosted"));
    } catch (e) {
      toast.error(errorMessage(e, t("groups.planner.discordFailed")));
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="panel space-y-5 p-4 sm:p-5" aria-labelledby="planner-title">
      <div className="space-y-1">
        <p className="kicker">{t("groups.planner.kicker")}</p>
        <h2 id="planner-title" className="text-lg font-semibold">
          {t("groups.planner.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("groups.planner.description", { days: PLANNER_WINDOW_DAYS })}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{t("groups.planner.whoIn")}</legend>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {members.map((m) => {
            const on = picked.includes(m.accountId32);
            const name = nameOf(m.accountId32);
            return (
              <li key={m.accountId32}>
                <label
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors",
                    on ? "border-gold/50 bg-gold/[0.06]" : "border-white/[0.06] bg-white/[0.02]",
                    !on && full && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--gold)]"
                    checked={on}
                    disabled={!on && full}
                    onChange={(e) => toggle(m.accountId32, e.target.checked)}
                  />
                  <PlayerAvatar url={m.avatarUrl} name={name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  {m.you && (
                    <span className="text-xs text-muted-foreground">{t("groups.planner.you")}</span>
                  )}
                  {playing.has(m.accountId32) && (
                    <span className="rounded-full bg-win/15 px-2 py-0.5 text-[0.65rem] font-medium text-win">
                      {t("groups.planner.inDota")}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          {t("groups.planner.pickHint", { min: MIN_STACK, max: MAX_STACK })}
        </p>
      </fieldset>

      <Button
        type="button"
        className="w-full sm:w-auto"
        onClick={suggest}
        disabled={!ready || busy}
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Users aria-hidden />}
        {busy ? t("groups.planner.suggesting") : t("groups.planner.suggest")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}

      {plan && (
        <section className="space-y-4" aria-labelledby="planner-result-title" aria-live="polite">
          <h3 id="planner-result-title" className="text-base font-semibold">
            {t("groups.planner.resultTitle")}
          </h3>
          <ol className="space-y-2">
            {plan.slots.map((slot) => {
              const name = nameOf(slot.accountId32);
              const pos = posLabel(t, slot.position);
              return (
                <li
                  key={slot.accountId32}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                  data-testid="planner-slot"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-gold/10 px-1 py-1 text-center">
                      <span className="text-sm font-bold text-gold">{pos}</span>
                      <span className="text-[0.6rem] leading-tight text-muted-foreground">
                        {roleLabel(t, slot.position)}
                      </span>
                    </span>
                    <PlayerAvatar
                      url={byId.get(slot.accountId32)?.avatarUrl ?? null}
                      name={name}
                      size="sm"
                    />
                    <p className="min-w-0 flex-1 truncate font-medium">{name}</p>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {slotEvidence(t, slot, plan.windowDays).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {!plan.heroesLocked &&
                    (slot.heroes.length > 0 ? (
                      <ul
                        className="mt-2 flex flex-wrap gap-2"
                        aria-label={t("groups.planner.heroesTitle", { pos })}
                      >
                        {slot.heroes.map((h) => {
                          const info = plan.heroInfo[h.heroId];
                          return (
                            <li
                              key={h.heroId}
                              className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] py-1 pr-2 pl-1 text-xs"
                            >
                              <HeroPortrait hero={info} heroId={h.heroId} size="xs" />
                              <span>{info?.name ?? `#${h.heroId}`}</span>
                              <span className="text-muted-foreground tabular-nums">{wl(h)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("groups.planner.heroesNone", { pos })}
                      </p>
                    ))}
                </li>
              );
            })}
          </ol>

          {plan.heroesLocked && (
            <p className="flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/[0.05] p-3 text-xs">
              <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-gold" />
              <span>
                {t("groups.planner.heroesLocked")}{" "}
                <Link href="/plus" className="font-medium text-gold hover:underline">
                  {t("groups.planner.plusLink")}
                </Link>
              </span>
            </p>
          )}

          <ul className="space-y-1 text-sm text-muted-foreground" data-testid="planner-notes">
            {planNotes(t, plan, nameOf).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>

          {plan.worked.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium">{t("groups.planner.workedTitle")}</h4>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {plan.worked.map((c) => (
                  <li key={`${c.a.accountId32}:${c.a.position}:${c.b.accountId32}`}>
                    {comboText(t, c, nameOf, false)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.avoid.length > 0 && (
            <div
              className="space-y-1 rounded-xl border border-loss/30 bg-loss/[0.05] p-3"
              data-testid="planner-avoid"
            >
              <h4 className="flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle aria-hidden className="size-3.5 text-loss" />
                {t("groups.planner.avoidTitle")}
              </h4>
              <ul className="space-y-0.5 text-xs">
                {plan.avoid.map((c) => (
                  <li key={`${c.a.accountId32}:${c.a.position}:${c.b.accountId32}:${c.b.position}`}>
                    {comboText(t, c, nameOf, true)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1 font-medium text-foreground">
              {t("groups.planner.how")}
            </summary>
            <p className="mt-1">{howItWorks(t)}</p>
          </details>

          <div className="space-y-2">
            <details>
              <summary className="cursor-pointer py-1 text-sm font-medium">
                {t("groups.planner.shareTitle")}
              </summary>
              <pre
                className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 font-sans text-xs whitespace-pre-wrap"
                data-testid="planner-text"
                // Scrolls when long: reachable by keyboard.
                tabIndex={0}
                aria-label={t("groups.planner.shareTitle")}
              >
                {text}
              </pre>
            </details>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" variant="outline" onClick={copy}>
                <Copy aria-hidden />
                {t("groups.planner.copy")}
              </Button>
              {context.plus && context.discord && (
                <Button type="button" variant="outline" onClick={post} disabled={posting}>
                  {posting ? (
                    <Loader2 aria-hidden className="animate-spin" />
                  ) : (
                    <Send aria-hidden />
                  )}
                  {t("groups.planner.discordPost", {
                    channel: context.discord.name ?? t("groups.planner.discordChannel"),
                  })}
                </Button>
              )}
            </div>
            {context.plus && !context.discord && (
              <p className="text-xs text-muted-foreground">
                <Link href="/account" className="text-gold hover:underline">
                  {t("groups.planner.discordSetup")}
                </Link>
              </p>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
