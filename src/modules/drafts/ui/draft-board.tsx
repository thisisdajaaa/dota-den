"use client";

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
import { encodeSnapshot, snapshotOf } from "../application/snapshot";
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
import { getRuleset, listRulesets } from "../domain/rulesets";
import { FeedbackPanel } from "./feedback-panel";
import { HeroGrid } from "./hero-grid";
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

function seconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
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
}: {
  heroes: DraftHero[];
  /** Pre-built state (e.g. "practice this shared draft"). */
  initial?: DraftState;
}) {
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

  function dispatch(input: EventInput): boolean {
    const s = stateRef.current;
    const event = {
      ...input,
      expectedVersion: s.stateVersion,
      at: Math.max(Date.now(), s.lastEventAt ?? 0),
    } as DraftEvent;
    const res = applyEvent(s, event, { mode: "local", heroPool: pool });
    if (!res.ok) {
      toast.error(`That move isn't allowed (${res.error.type.replaceAll("_", " ")}).`);
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
      const t = Date.now();
      setNow(t);
      const r = resolveTime(stateRef.current, t);
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
        const res = await fetch("/api/v1/drafts/ai-move", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshot: encodeSnapshot(snapshotOf(state)), aiSide }),
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as
          (Omit<AiLogEntry, "step"> & { side: Side; error?: { message?: string } }) | null;
        if (!res.ok || !body) throw new Error(body?.error?.message ?? "The AI couldn't move.");
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
        setAiError(e instanceof Error ? e.message : "The AI couldn't move.");
      }
    })();
    return () => controller.abort();
    // Re-run per accepted event (stateVersion) or on retry; dispatch reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTurn, state.stateVersion, aiRetry]);

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
    const t = next.timer ?? timerOn;
    setRulesetId(r);
    setFirstSide(f);
    setTimerOn(t);
    if (next.opponent) setOpponent(next.opponent);
    setAiLog([]);
    setAiError(null);
    const fresh = newDraft(r, f, t);
    stateRef.current = fresh;
    setState(fresh);
  }

  function choose(heroId: number) {
    const t = currentTurn(stateRef.current);
    if (!t) return;
    dispatch({ type: t.action, side: t.side, heroId });
  }

  const shareUrl = () =>
    `${window.location.origin}/draft?snapshot=${encodeSnapshot(snapshotOf(state))}`;

  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast.success("Link copied. Anyone with it can view this draft.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  function save() {
    const entry: SavedDraft = {
      name: `${ruleset.name.split(" (")[0]} · ${new Date().toLocaleString()}`,
      savedAt: new Date().toISOString(),
      snapshot: encodeSnapshot(snapshotOf(state)),
    };
    const next = [entry, ...saves].slice(0, MAX_SAVES);
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(next));
      // Same-tab writes don't fire "storage"; notify the store ourselves.
      window.dispatchEvent(new StorageEvent("storage", { key: SAVES_KEY }));
      toast.success("Draft saved on this device");
    } catch {
      toast.error("Couldn't save in this browser.");
    }
  }

  const unavailable = useMemo(() => {
    const free = new Set(availableHeroes(state, pool));
    return new Set(pool.filter((id) => !free.has(id)));
  }, [state, pool]);

  const picksPerSide = ruleset.sequence.filter((s) => s.action === "pick").length / 2;
  const bansPerSide = ruleset.sequence.filter((s) => s.action === "ban").length / 2;
  const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");
  const announcement =
    state.status === "completed"
      ? "Draft complete."
      : turn && started
        ? `${sideName(turn.side)} to ${turn.action}. Step ${turn.stepIndex + 1} of ${ruleset.sequence.length}.`
        : "Draft not started.";

  const reserve = (side: Side) =>
    state.timer.enabled
      ? seconds(
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
          <SelectTrigger size="sm" className="h-8 w-56 text-xs" aria-label="Opponent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dire">You: Radiant · vs AI captain</SelectItem>
            <SelectItem value="radiant">You: Dire · vs AI captain</SelectItem>
            <SelectItem value="none">Practice both sides</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={rulesetId}
          onValueChange={(v) => reconfigure({ rulesetId: v })}
          disabled={started}
        >
          <SelectTrigger size="sm" className="h-8 w-56 text-xs" aria-label="Ruleset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listRulesets().map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={firstSide}
          onValueChange={(v) => reconfigure({ firstSide: v as Side })}
          disabled={started}
        >
          <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="First pick">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="radiant">Radiant first pick</SelectItem>
            <SelectItem value="dire">Dire first pick</SelectItem>
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
          Timer
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {!started ? (
            <Button size="sm" onClick={() => dispatch({ type: "start" })} className="gap-1.5">
              <Play className="size-3.5" /> Start draft
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
                <Undo2 className="size-3.5" /> Undo
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
                  {state.status === "paused" ? "Resume" : "Pause"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => reconfigure({})} className="gap-1.5">
                <RotateCcw className="size-3.5" /> Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={save} className="gap-1.5">
                <Save className="size-3.5" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={share} className="gap-1.5">
                <Link2 className="size-3.5" /> Share
              </Button>
            </>
          )}
          {saves.length > 0 && !started && (
            <Select onValueChange={(v) => router.push(`/draft?snapshot=${v}`)}>
              <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Saved drafts">
                <SelectValue placeholder="Saved drafts" />
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
              ? "Draft complete"
              : started
                ? `Step ${state.stepIndex + 1} of ${ruleset.sequence.length}`
                : "Ready"}
          </p>
          <p className="text-xl font-semibold">
            {state.status === "completed" ? (
              "Both lineups are locked in"
            ) : turn && started ? (
              <>
                <span className={turn.side === "radiant" ? "text-win" : "text-loss"}>
                  {aiSide ? (turn.side === aiSide ? "AI captain" : "Your") : sideName(turn.side)}
                </span>{" "}
                {aiSide
                  ? turn.side === aiSide
                    ? turn.action === "pick"
                      ? "is picking…"
                      : "is banning…"
                    : turn.action === "pick"
                      ? "pick"
                      : "ban"
                  : turn.action === "pick"
                    ? "picks"
                    : "bans"}
                {state.status === "paused" && (
                  <span className="text-muted-foreground"> (paused)</span>
                )}
              </>
            ) : (
              `${ruleset.name}`
            )}
          </p>
          {!started && (
            <p className="max-w-xl text-xs text-muted-foreground">{ruleset.description}</p>
          )}
        </div>
        {time.timed && started && state.status !== "completed" && (
          <div className="text-right" aria-label="Turn timer">
            <div
              className={cn(
                "text-3xl font-semibold tabular-nums",
                time.turnRemainingMs <= 5_000 && "text-loss",
              )}
            >
              {time.turnRemainingMs > 0
                ? seconds(time.turnRemainingMs)
                : `+${seconds(time.reserveRemainingMs)}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {time.turnRemainingMs > 0 ? "turn time" : "using reserve"}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
          />
        ))}
      </div>

      {aiSide && started && (
        <AiCaptainPanel
          log={aiLog}
          heroes={heroMap}
          thinking={aiTurn && !aiError}
          error={aiError}
          onRetry={() => {
            setAiError(null);
            setAiRetry((n) => n + 1);
          }}
        />
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

      {state.status !== "completed" && (
        <HeroGrid
          heroes={heroes}
          unavailable={unavailable}
          disabled={!started || state.status === "paused" || aiTurn}
          actionLabel={turn?.action ?? "pick"}
          onChoose={choose}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
      <p className="text-xs text-muted-foreground">
        Feedback is rule-based from hero role tags, with the reasons shown. It doesn&apos;t predict
        who wins.
      </p>
    </div>
  );
}

function AiCaptainPanel({
  log,
  heroes,
  thinking,
  error,
  onRetry,
}: {
  log: AiLogEntry[];
  heroes: Map<number, DraftHero>;
  thinking: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const model = log.find((e) => e.source === "model")?.model;
  return (
    <section className="panel p-4" aria-label="AI captain">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot aria-hidden className="size-4 text-gold" /> AI captain
        </h2>
        <span className="text-xs text-muted-foreground">
          {model ? `Drafting with ${model} via Groq` : "Waiting for its first move"}
        </span>
      </header>
      {thinking && (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-gold" />
          Thinking about its next move…
        </p>
      )}
      {error && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-loss" role="alert">
          {error}
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </p>
      )}
      {log.length === 0 ? (
        !thinking && (
          <p className="text-sm text-muted-foreground">
            Its picks and bans will show here, with its reasoning.
          </p>
        )
      ) : (
        <ol className="max-h-60 space-y-2 overflow-y-auto">
          {log.map((e) => {
            const hero = heroes.get(e.heroId);
            return (
              <li key={e.step} className="flex gap-3 text-sm">
                <span className="relative mt-0.5 h-6 w-[2.67rem] shrink-0 overflow-hidden rounded bg-muted">
                  {hero?.iconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny icon
                    <img
                      src={hero.imageUrl ?? hero.iconUrl}
                      alt=""
                      className={cn("size-full object-cover", e.action === "ban" && "grayscale")}
                    />
                  )}
                </span>
                <span>
                  <span className="font-medium">
                    {e.action === "ban" ? "Banned" : "Picked"} {hero?.name ?? `Hero #${e.heroId}`}
                  </span>
                  <span className="text-muted-foreground">: {e.reason}</span>
                  {e.source === "heuristic" && (
                    <span
                      className="ml-1.5 rounded border border-white/15 px-1 text-[0.6rem] text-muted-foreground"
                      title="The language model was unavailable, so a rule-based choice was made"
                    >
                      rule-based
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
