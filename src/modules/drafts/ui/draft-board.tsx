"use client";

import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Bot, Link2, Pause, Play, RotateCcw, Save, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { encodeSnapshot, snapshotOf } from "../domain/snapshot";
import {
  applyEvent,
  availableHeroes,
  createDraft,
  currentTurn,
  resolveTime,
  type DraftEvent,
  type DraftState,
  type Side,
} from "../domain/draft-state";
import type { Position } from "../domain/draft-positions";
import type { Phrase } from "../domain/phrase";
import { getRuleset, listRulesets } from "../domain/rulesets";
import { DraftOutlookPanel, positionsFrom, useDraftOutlook } from "./draft-outlook-panel";
import { FeedbackPanel } from "./feedback-panel";
import { HeroGrid } from "./hero-grid";
import {
  actionName,
  positionName,
  roleName,
  rulesetDescription,
  rulesetName,
  sayOr,
  seconds,
  sideName,
  type T,
} from "./i18n";
import { SequenceStrip } from "./sequence-strip";
import { TeamPanel } from "./team-panel";
import type { DraftHero } from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventInput = DistributiveOmit<DraftEvent, "expectedVersion" | "at">;

type Opponent = "none" | "radiant" | "dire";

interface AiLogEntry {
  step: number;
  action: "pick" | "ban";
  heroId: number;
  reason: string;
  source: "model" | "heuristic";
  model: string | null;
}

const SAVES_KEY = "dd_draft_saves";
const MAX_SAVES = 10;

interface SavedDraft {
  name: string;
  savedAt: string;
  snapshot: string;
}

function parseSaves(raw: string): SavedDraft[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedDraft[]).slice(0, MAX_SAVES) : [];
  } catch {
    return [];
  }
}

// localStorage as an external store: server renders "no saves", the client reads real data.
function subscribeSaves(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readSavesRaw(): string {
  try {
    return localStorage.getItem(SAVES_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function newDraft(rulesetId: string, firstSide: Side, timer: boolean): DraftState {
  const ruleset = listRulesets().find((r) => r.id === rulesetId) ?? listRulesets()[0];
  const res = createDraft({
    rulesetId: ruleset.id,
    rulesetVersion: ruleset.version,
    firstSide,
    timerEnabled: timer,
  });
  if (!res.ok) throw new Error(`Cannot create draft: ${res.error.type}`);
  return res.value;
}

/** Local two-sided draft practice. The pure engine is the source of truth for every rule. */
export function DraftBoard({
  heroes,
  initial,
  signedIn = false,
}: {
  heroes: DraftHero[];
  /** Pre-built state (e.g. "practice this shared draft"). */
  initial?: DraftState;
  /** Signed in: each draft finished here is saved for the leaderboards. */
  signedIn?: boolean;
}) {
  const t = useT();
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const pool = useMemo(() => heroes.map((h) => h.id), [heroes]);
  const [rulesetId, setRulesetId] = useState(initial?.rulesetId ?? "cm-2026");
  const [firstSide, setFirstSide] = useState<Side>(initial?.firstSide ?? "radiant");
  const [timerOn, setTimerOn] = useState(initial?.timer.enabled ?? false);
  // Which side the AI captain plays; "none" = practice both sides yourself.
  const [opponent, setOpponent] = useState<Opponent>("dire");
  const [aiLog, setAiLog] = useState<AiLogEntry[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRetry, setAiRetry] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionSet | null>(null);
  /** Why the current turn's suggestions haven't arrived (the draft works without them). */
  const [suggestionIssue, setSuggestionIssue] = useState<{
    version: number;
    kind: "retrying" | "unavailable";
  } | null>(null);
  /** Steps where you chose one of the suggestions (shown in the draft log). */
  const [followed, setFollowed] = useState<ReadonlySet<number>>(new Set());
  const [state, setState] = useState<DraftState>(
    () => initial ?? newDraft("cm-2026", "radiant", false),
  );
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const savesRaw = useSyncExternalStore(subscribeSaves, readSavesRaw, () => "[]");
  const saves = useMemo(() => parseSaves(savesRaw), [savesRaw]);
  // Latest state for event handlers and the timer; only written alongside setState.
  const stateRef = useRef(state);

  const rulesetRes = getRuleset(state.rulesetId, state.rulesetVersion);
  const ruleset = rulesetRes.ok ? rulesetRes.value : listRulesets()[0];
  const turn = currentTurn(state);
  const time = resolveTime(state, now);
  const started = state.status !== "not_started";
  const aiSide: Side | null = opponent === "none" ? null : opponent;
  const aiTurn = aiSide !== null && state.status === "in_progress" && turn?.side === aiSide;
  // One outlook fetch per pick, shared by the outlook panel and the team panels' positions.
  const outlook = useDraftOutlook(started ? state : null);
  const positions = useMemo(() => positionsFrom(outlook), [outlook]);
  const rolesKey = JSON.stringify(outlook.roles);

  function dispatch(input: EventInput): boolean {
    const s = stateRef.current;
    const event = {
      ...input,
      expectedVersion: s.stateVersion,
      at: Math.max(Date.now(), s.lastEventAt ?? 0),
    } as DraftEvent;
    const res = applyEvent(s, event, { mode: "local", heroPool: pool });
    if (!res.ok) {
      toast.error(t("drafts.board.invalidMove", { reason: res.error.type.replaceAll("_", " ") }));
      return false;
    }
    stateRef.current = res.value;
    setState(res.value);
    return true;
  }

  // Authoritative clock: tick, and resolve an expired turn with a replayable seeded timeout.
  useEffect(() => {
    if (!state.timer.enabled || state.status !== "in_progress") return;
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      const r = resolveTime(stateRef.current, at);
      if (r.timed && r.expired && !r.paused) {
        dispatch({ type: "timeout", seed: Math.floor(Math.random() * 2 ** 31) });
      }
    }, 250);
    return () => clearInterval(id);
    // dispatch reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timer.enabled, state.status]);

  // The AI captain moves whenever it's its turn. Stale replies (after an undo) are ignored.
  useEffect(() => {
    if (!aiTurn) return;
    const version = state.stateVersion;
    const controller = new AbortController();
    (async () => {
      try {
        const body = await apiRequest<Omit<AiLogEntry, "step"> & { side: Side }>(
          "/api/v1/drafts/ai-move",
          {
            method: "POST",
            body: { snapshot: encodeSnapshot(snapshotOf(state)), aiSide },
            signal: controller.signal,
          },
        );
        if (stateRef.current.stateVersion !== version) return;
        const step = stateRef.current.stepIndex;
        if (dispatch({ type: body.action, side: body.side, heroId: body.heroId })) {
          setAiError(null);
          setAiLog((log) => [
            {
              step,
              action: body.action,
              heroId: body.heroId,
              reason: body.reason,
              source: body.source,
              model: body.model,
            },
            ...log,
          ]);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setAiError(e instanceof Error ? e.message : t("drafts.board.aiFailed"));
      }
    })();
    return () => controller.abort();
    // Re-run per accepted event (stateVersion) or on retry; dispatch reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTurn, state.stateVersion, aiRetry]);

  // Signed in: save each draft finished on this board once, for the leaderboards (the server
  // also counts the same draft only once).
  const savedDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || state.status !== "completed" || state === initial) return;
    const snapshot = encodeSnapshot(snapshotOf(state));
    if (savedDraft.current === snapshot) return;
    savedDraft.current = snapshot;
    apiRequest<{ counted: boolean }>("/api/v1/drafts/results", {
      method: "POST",
      body: { snapshot, aiSide },
    })
      .then((res) => res.counted && toast.success(t("drafts.board.savedLeaderboards")))
      .catch(() => {}); // Optional: the draft itself is unaffected.
  }, [signedIn, state, initial, aiSide, t]);

  const humanTurn =
    state.status === "in_progress" && turn !== null && (!aiSide || turn.side !== aiSide);

  // Data-backed suggestions for your turn; refetched after every move so they react to the
  // opponent's latest pick or ban.
  useEffect(() => {
    if (!humanTurn || !turn) return;
    const version = state.stateVersion;
    const controller = new AbortController();
    // Positions you set by hand decide which positions are still open.
    const body = {
      snapshot: encodeSnapshot(snapshotOf(state)),
      side: turn.side,
      roles: outlook.roles,
    };
    const current = () => !controller.signal.aborted && stateRef.current.stateVersion === version;
    (async () => {
      // Busy (rate limited, server or network error): back off and retry, then say so.
      // Anything else (e.g. an invalid draft) won't get better by retrying.
      for (let attempt = 0; attempt <= SUGGESTION_RETRY_MS.length; attempt++) {
        let retryable = true;
        try {
          const set = await apiRequest<Omit<SuggestionSet, "version">>(
            "/api/v1/drafts/suggestions",
            { method: "POST", body, signal: controller.signal },
          );
          if (current()) setSuggestions({ ...set, version });
          return;
        } catch (e) {
          if (controller.signal.aborted) return;
          // Network errors and busy servers are worth retrying; a bad request isn't.
          if (e instanceof ApiClientError) retryable = e.status === 429 || e.status >= 500;
        }
        if (!retryable || attempt === SUGGESTION_RETRY_MS.length) break;
        if (current()) setSuggestionIssue({ version, kind: "retrying" });
        await new Promise((r) => setTimeout(r, SUGGESTION_RETRY_MS[attempt]));
        if (!current()) return;
      }
      if (current()) setSuggestionIssue({ version, kind: "unavailable" });
    })();
    return () => controller.abort();
    // Keyed on the accepted event count; state is read at that version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanTurn, state.stateVersion, rolesKey]);

  function chooseSuggested(heroId: number) {
    const step = stateRef.current.stepIndex;
    const next = currentTurn(stateRef.current);
    if (!next) return;
    if (dispatch({ type: next.action, side: next.side, heroId })) {
      setFollowed((prev) => new Set(prev).add(step));
    }
  }

  /** Undo; against the AI, keep undoing until it's your turn again. */
  function undo() {
    if (!dispatch({ type: "undo" })) return;
    while (
      aiSide &&
      stateRef.current.turns.length > 0 &&
      currentTurn(stateRef.current)?.side === aiSide
    ) {
      if (!dispatch({ type: "undo" })) break;
    }
    const step = stateRef.current.stepIndex;
    setAiLog((log) => log.filter((e) => e.step < step));
    setFollowed((prev) => new Set([...prev].filter((s) => s < step)));
    setAiError(null);
  }

  function reconfigure(next: {
    rulesetId?: string;
    firstSide?: Side;
    timer?: boolean;
    opponent?: Opponent;
  }) {
    const r = next.rulesetId ?? rulesetId;
    const f = next.firstSide ?? firstSide;
    const timer = next.timer ?? timerOn;
    setRulesetId(r);
    setFirstSide(f);
    setTimerOn(timer);
    if (next.opponent) setOpponent(next.opponent);
    setAiLog([]);
    setAiError(null);
    setFollowed(new Set());
    setSuggestions(null);
    const fresh = newDraft(r, f, timer);
    stateRef.current = fresh;
    setState(fresh);
  }

  function choose(heroId: number) {
    const next = currentTurn(stateRef.current);
    if (!next) return;
    dispatch({ type: next.action, side: next.side, heroId });
  }

  const shareUrl = () =>
    `${window.location.origin}/draft?snapshot=${encodeSnapshot(snapshotOf(state))}`;

  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast.success(t("drafts.board.linkCopied"));
    } catch {
      toast.error(t("drafts.board.copyFailed"));
    }
  }

  function save() {
    const entry: SavedDraft = {
      name: `${rulesetName(t, ruleset).split(" (")[0]} · ${new Date().toLocaleString()}`,
      savedAt: new Date().toISOString(),
      snapshot: encodeSnapshot(snapshotOf(state)),
    };
    const next = [entry, ...saves].slice(0, MAX_SAVES);
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(next));
      // Same-tab writes don't fire "storage"; notify the store ourselves.
      window.dispatchEvent(new StorageEvent("storage", { key: SAVES_KEY }));
      toast.success(t("drafts.board.savedDevice"));
    } catch {
      toast.error(t("drafts.board.saveFailed"));
    }
  }

  const unavailable = useMemo(() => {
    const free = new Set(availableHeroes(state, pool));
    return new Set(pool.filter((id) => !free.has(id)));
  }, [state, pool]);

  const picksPerSide = ruleset.sequence.filter((s) => s.action === "pick").length / 2;
  const bansPerSide = ruleset.sequence.filter((s) => s.action === "ban").length / 2;
  const announcement =
    state.status === "completed"
      ? t("drafts.board.announceComplete")
      : turn && started
        ? t("drafts.board.announceTurn", {
            side: sideName(t, turn.side),
            action: actionName(t, turn.action),
            step: turn.stepIndex + 1,
            total: ruleset.sequence.length,
          })
        : t("drafts.board.announceNotStarted");

  const reserve = (side: Side) =>
    state.timer.enabled
      ? seconds(
          t,
          time.timed && time.side === side
            ? time.reserveRemainingMs
            : state.timer.reserveRemainingMs[side],
        )
      : null;

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <Select
          value={opponent}
          onValueChange={(v) => reconfigure({ opponent: v as Opponent })}
          disabled={started}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-56 text-xs"
            aria-label={t("drafts.board.opponent")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dire">{t("drafts.board.vsAiRadiant")}</SelectItem>
            <SelectItem value="radiant">{t("drafts.board.vsAiDire")}</SelectItem>
            <SelectItem value="none">{t("drafts.board.bothSides")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={rulesetId}
          onValueChange={(v) => reconfigure({ rulesetId: v })}
          disabled={started}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-56 text-xs"
            aria-label={t("drafts.board.ruleset")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listRulesets().map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {rulesetName(t, r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={firstSide}
          onValueChange={(v) => reconfigure({ firstSide: v as Side })}
          disabled={started}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-40 text-xs"
            aria-label={t("drafts.board.firstPick")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="radiant">{t("drafts.board.radiantFirst")}</SelectItem>
            <SelectItem value="dire">{t("drafts.board.direFirst")}</SelectItem>
          </SelectContent>
        </Select>
        <label className={cn("flex items-center gap-2 px-2 text-xs", started && "opacity-50")}>
          <input
            type="checkbox"
            checked={timerOn}
            disabled={started}
            onChange={(e) => reconfigure({ timer: e.target.checked })}
            className="accent-[var(--gold)]"
          />
          {t("drafts.board.timer")}
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {!started ? (
            <Button size="sm" onClick={() => dispatch({ type: "start" })} className="gap-1.5">
              <Play className="size-3.5" /> {t("drafts.board.start")}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={undo}
                disabled={state.turns.length === 0}
                className="gap-1.5"
              >
                <Undo2 className="size-3.5" /> {t("drafts.board.undo")}
              </Button>
              {state.timer.enabled && state.status !== "completed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch({ type: state.status === "paused" ? "resume" : "pause" })}
                  className="gap-1.5"
                >
                  {state.status === "paused" ? (
                    <Play className="size-3.5" />
                  ) : (
                    <Pause className="size-3.5" />
                  )}
                  {state.status === "paused" ? t("drafts.board.resume") : t("drafts.board.pause")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => reconfigure({})} className="gap-1.5">
                <RotateCcw className="size-3.5" /> {t("drafts.board.reset")}
              </Button>
              <Button size="sm" variant="ghost" onClick={save} className="gap-1.5">
                <Save className="size-3.5" /> {t("drafts.board.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={share} className="gap-1.5">
                <Link2 className="size-3.5" /> {t("drafts.board.share")}
              </Button>
            </>
          )}
          {saves.length > 0 && !started && (
            <Select onValueChange={(v) => router.push(`/draft?snapshot=${v}`)}>
              <SelectTrigger
                size="sm"
                className="h-8 w-40 text-xs"
                aria-label={t("drafts.board.savedDrafts")}
              >
                <SelectValue placeholder={t("drafts.board.savedDrafts")} />
              </SelectTrigger>
              <SelectContent>
                {saves.map((s) => (
                  <SelectItem key={s.savedAt} value={s.snapshot}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div
        className={cn(
          "panel flex flex-wrap items-center justify-between gap-3 px-5 py-4",
          turn &&
            started &&
            state.status !== "completed" &&
            (turn.side === "radiant" ? "border-win/40" : "border-loss/40"),
        )}
      >
        <div>
          <p className="kicker">
            {state.status === "completed"
              ? t("drafts.board.complete")
              : started
                ? t("drafts.board.step", {
                    step: state.stepIndex + 1,
                    total: ruleset.sequence.length,
                  })
                : t("drafts.board.ready")}
          </p>
          <p className="text-xl font-semibold">
            {state.status === "completed" ? (
              t("drafts.board.lockedIn")
            ) : turn && started ? (
              <>
                <span className={turn.side === "radiant" ? "text-win" : "text-loss"}>
                  {aiSide
                    ? turn.side === aiSide
                      ? t("drafts.board.aiCaptain")
                      : t("drafts.board.your")
                    : sideName(t, turn.side)}
                </span>{" "}
                {aiSide
                  ? turn.side === aiSide
                    ? turn.action === "pick"
                      ? t("drafts.board.isPicking")
                      : t("drafts.board.isBanning")
                    : turn.action === "pick"
                      ? t("drafts.board.yourPick")
                      : t("drafts.board.yourBan")
                  : turn.action === "pick"
                    ? t("drafts.board.sidePicks")
                    : t("drafts.board.sideBans")}
                {state.status === "paused" && (
                  <span className="text-muted-foreground">{t("drafts.board.paused")}</span>
                )}
              </>
            ) : (
              rulesetName(t, ruleset)
            )}
          </p>
          {!started && (
            <p className="max-w-xl text-xs text-muted-foreground">
              {rulesetDescription(t, ruleset)}
            </p>
          )}
        </div>
        {time.timed && started && state.status !== "completed" && (
          <div className="text-right" aria-label={t("drafts.board.turnTimer")}>
            <div
              className={cn(
                "text-3xl font-semibold tabular-nums",
                time.turnRemainingMs <= 5_000 && "text-loss",
              )}
            >
              {time.turnRemainingMs > 0
                ? seconds(t, time.turnRemainingMs)
                : `+${seconds(t, time.reserveRemainingMs)}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {time.turnRemainingMs > 0
                ? t("drafts.board.turnTime")
                : t("drafts.board.usingReserve")}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(["radiant", "dire"] as const).map((side) => (
          <TeamPanel
            key={side}
            side={side}
            picks={state.sides[side].picks}
            bans={state.sides[side].bans}
            heroes={heroMap}
            totalPicks={picksPerSide}
            totalBans={bansPerSide}
            activeAction={
              started && turn?.side === side && state.status !== "completed" ? turn.action : null
            }
            isFirst={state.firstSide === side}
            reserveLabel={reserve(side)}
            controller={aiSide ? (side === aiSide ? "ai" : "you") : undefined}
            positions={positions}
          />
        ))}
      </div>

      {/* Finished: the outlook and report card first. Drafting: what you need to pick first. */}
      {state.status === "completed" && started && (
        <DraftOutlookPanel state={state} heroes={heroMap} data={outlook} />
      )}

      <div className="panel p-3">
        <SequenceStrip
          sequence={ruleset.sequence}
          firstSide={state.firstSide}
          turns={state.turns}
          stepIndex={state.stepIndex}
          heroes={heroMap}
        />
      </div>

      {humanTurn && turn && (
        <SuggestionsPanel
          action={turn.action}
          set={suggestions?.version === state.stateVersion ? suggestions : null}
          issue={suggestionIssue?.version === state.stateVersion ? suggestionIssue.kind : null}
          heroes={heroMap}
          unavailable={unavailable}
          disabled={state.status !== "in_progress"}
          onChoose={chooseSuggested}
        />
      )}

      {state.status !== "completed" && (
        <HeroGrid
          heroes={heroes}
          unavailable={unavailable}
          disabled={!started || state.status === "paused" || aiTurn}
          actionLabel={actionName(t, turn?.action ?? "pick")}
          onChoose={choose}
        />
      )}

      {!(state.status === "completed") && started && (
        <DraftOutlookPanel state={state} heroes={heroMap} data={outlook} />
      )}

      {started && (
        <DraftLogPanel
          turns={state.turns}
          aiSide={aiSide}
          aiLog={aiLog}
          followed={followed}
          heroes={heroMap}
          thinking={aiTurn && !aiError}
          error={aiError}
          onRetry={() => {
            setAiError(null);
            setAiRetry((n) => n + 1);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(["radiant", "dire"] as const).map((side) => (
          <FeedbackPanel
            key={side}
            side={side}
            picks={state.sides[side].picks
              .map((p) => heroMap.get(p.heroId))
              .filter((h): h is DraftHero => !!h)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("drafts.board.feedbackNote")}</p>
    </div>
  );
}

/** Waits before each retry when suggestions are busy. */
const SUGGESTION_RETRY_MS = [2_000, 5_000, 10_000];

interface SuggestionSet {
  version: number;
  action: "pick" | "ban";
  situation: string;
  situationPhrase?: Phrase;
  candidates: Array<{
    heroId: number;
    name: string;
    role: "core" | "support";
    position: Position | null;
    facts: string[];
    factPhrases?: Phrase[];
  }>;
}

function HeroThumb({ hero, dim }: { hero: DraftHero | undefined; dim?: boolean }) {
  return (
    <span className="relative h-6 w-[2.67rem] shrink-0 overflow-hidden rounded bg-muted">
      {(hero?.imageUrl ?? hero?.iconUrl) && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny icon
        <img
          src={(hero.imageUrl ?? hero.iconUrl)!}
          alt=""
          className={cn("size-full object-cover", dim && "grayscale")}
        />
      )}
    </span>
  );
}

/** Top options for your turn, ranked with the same data the AI uses. Click to choose. */
function SuggestionsPanel({
  action,
  set,
  heroes,
  unavailable,
  disabled,
  onChoose,
  issue,
}: {
  action: "pick" | "ban";
  set: SuggestionSet | null;
  issue: "retrying" | "unavailable" | null;
  heroes: Map<number, DraftHero>;
  unavailable: ReadonlySet<number>;
  disabled: boolean;
  onChoose: (heroId: number) => void;
}) {
  const t = useT();
  return (
    <section className="panel p-4" aria-label={t("drafts.suggestions.label")}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {action === "pick"
            ? t("drafts.suggestions.titlePicks")
            : t("drafts.suggestions.titleBans")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {set
            ? sayOr(t, set.situationPhrase, set.situation)
            : issue === "retrying"
              ? t("drafts.suggestions.retrying")
              : issue === "unavailable"
                ? null
                : t("drafts.suggestions.looking")}
        </span>
      </header>
      {!set && issue === "unavailable" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("drafts.suggestions.unavailable")}
        </p>
      ) : !set ? (
        <div className="flex gap-2" aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="h-20 flex-1 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {set.candidates.map((c) => {
            const hero = heroes.get(c.heroId);
            const taken = unavailable.has(c.heroId);
            const facts = factsOf(t, c);
            return (
              <li key={c.heroId}>
                <button
                  type="button"
                  disabled={disabled || taken}
                  onClick={() => onChoose(c.heroId)}
                  aria-label={t("drafts.suggestions.choose", {
                    action: actionName(t, action),
                    hero: c.name,
                    facts: facts.join("; "),
                  })}
                  className="group flex h-full w-full flex-col gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 text-left transition hover:border-gold/40 hover:bg-gold/[0.05] focus-visible:border-gold disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <HeroThumb hero={hero} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                        {c.position
                          ? t("drafts.suggestions.pos", {
                              n: c.position,
                              name: positionName(t, c.position),
                            })
                          : roleName(t, c.role)}
                      </span>
                    </span>
                  </span>
                  <span className="text-[0.7rem] leading-snug text-muted-foreground">
                    {facts.slice(0, 2).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A candidate's evidence in the viewer's language (English when the data has no phrases). */
function factsOf(t: T, c: { facts: string[]; factPhrases?: Phrase[] }): string[] {
  return c.factPhrases && c.factPhrases.length === c.facts.length
    ? c.factPhrases.map((p, i) => sayOr(t, p, c.facts[i]))
    : c.facts;
}

/** Every pick and ban in order (newest first), for both teams, with the AI's reasoning. */
function DraftLogPanel({
  turns,
  aiSide,
  aiLog,
  followed,
  heroes,
  thinking,
  error,
  onRetry,
}: {
  turns: DraftState["turns"];
  aiSide: Side | null;
  aiLog: AiLogEntry[];
  followed: ReadonlySet<number>;
  heroes: Map<number, DraftHero>;
  thinking: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useT();
  const reasons = new Map(aiLog.map((e) => [e.step, e]));
  const model = aiLog.find((e) => e.source === "model")?.model;
  const who = (side: Side) =>
    aiSide ? (side === aiSide ? t("drafts.log.ai") : t("drafts.log.you")) : sideName(t, side);
  return (
    <section className="panel p-4" aria-label={t("drafts.log.label")}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot aria-hidden className="size-4 text-gold" /> {t("drafts.log.title")}
        </h2>
        {aiSide && (
          <span className="text-xs text-muted-foreground">
            {model ? t("drafts.log.model", { model }) : t("drafts.log.ready")}
          </span>
        )}
      </header>
      {thinking && (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-gold" />
          {t("drafts.log.thinking")}
        </p>
      )}
      {error && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-loss" role="alert">
          {error}
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("drafts.log.retry")}
          </Button>
        </p>
      )}
      {turns.length === 0 ? (
        !thinking && <p className="text-sm text-muted-foreground">{t("drafts.log.empty")}</p>
      ) : (
        <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {[...turns].reverse().map((turn) => {
            const hero = turn.heroId !== null ? heroes.get(turn.heroId) : undefined;
            const ai = reasons.get(turn.stepIndex);
            const label = who(turn.side);
            const heroName = hero?.name ?? t("drafts.log.hero", { id: turn.heroId ?? "" });
            return (
              <li key={turn.stepIndex} className="flex gap-3 text-sm">
                <span className="w-6 shrink-0 pt-0.5 text-right text-[0.65rem] text-muted-foreground tabular-nums">
                  {turn.stepIndex + 1}
                </span>
                <HeroThumb hero={hero} dim={turn.action === "ban"} />
                <span className="min-w-0">
                  <span
                    className={cn(
                      "mr-1.5 rounded px-1 text-[0.6rem] font-semibold tracking-wider uppercase",
                      turn.side === "radiant" ? "bg-win/15 text-win" : "bg-loss/15 text-loss",
                    )}
                  >
                    {label}
                  </span>
                  <span className="font-medium">
                    {turn.heroId === null
                      ? t("drafts.log.skipped")
                      : turn.action === "ban"
                        ? t("drafts.log.banned", { hero: heroName })
                        : t("drafts.log.picked", { hero: heroName })}
                  </span>
                  {turn.resolution === "timeout" && turn.heroId !== null && (
                    <span className="text-muted-foreground">{t("drafts.log.random")}</span>
                  )}
                  {ai && <span className="text-muted-foreground">: {ai.reason}</span>}
                  {ai?.source === "heuristic" && (
                    <span
                      className="ml-1.5 rounded border border-white/15 px-1 text-[0.6rem] text-muted-foreground"
                      title={t("drafts.log.ruleBasedTitle")}
                    >
                      {t("drafts.log.ruleBased")}
                    </span>
                  )}
                  {followed.has(turn.stepIndex) && (
                    <span className="ml-1.5 rounded border border-gold/30 px-1 text-[0.6rem] text-gold">
                      {t("drafts.log.suggested")}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
