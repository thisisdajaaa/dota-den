"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Link2, Pause, Play, RotateCcw, UserRound, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { EventView, RoomView } from "../application/room-views";
import { encodeSnapshot, snapshotOf } from "../application/snapshot";
import { availableHeroes, currentTurn, resolveTime, type Side } from "../domain/draft-state";
import { getRuleset } from "../domain/rulesets";
import { DraftOutlookPanel, positionsFrom, useDraftOutlook } from "./draft-outlook-panel";
import { FeedbackPanel } from "./feedback-panel";
import { HeroGrid } from "./hero-grid";
import { RoomResultPanel } from "./room-result-panel";
import { SequenceStrip } from "./sequence-strip";
import { TeamPanel } from "./team-panel";
import type { DraftHero } from "./types";

const POLL_VISIBLE_MS = 1_000;
const POLL_HIDDEN_MS = 5_000;
const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

function seconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

type ApiError = { error?: { message?: string; details?: { room?: RoomView } } } | null;

/** A live multiplayer draft room. The server is authoritative; this view polls and resyncs. */
export function RoomClient({
  initialRoom,
  initialEvents,
  heroes,
}: {
  initialRoom: RoomView;
  initialEvents: EventView[];
  heroes: DraftHero[];
}) {
  const router = useRouter();
  const [room, setRoom] = useState(initialRoom);
  const [events, setEvents] = useState(initialEvents);
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  // Server time for the timer display; ticks locally between polls.
  const [serverNow, setServerNow] = useState(initialRoom.serverNow);
  // Offset between the server clock and ours, measured on each response.
  const offset = useRef<number | null>(null);
  const roomRef = useRef(room);
  const lastSeq = useRef(initialEvents.at(-1)?.sequence ?? 0);

  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const pool = useMemo(() => heroes.map((h) => h.id), [heroes]);

  const apply = useCallback((next: RoomView, newEvents: EventView[] = []) => {
    offset.current = next.serverNow - Date.now();
    setServerNow(next.serverNow);
    roomRef.current = next;
    setRoom(next);
    if (newEvents.length) {
      lastSeq.current = Math.max(lastSeq.current, ...newEvents.map((e) => e.sequence));
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.sequence));
        return [...prev, ...newEvents.filter((e) => !seen.has(e.sequence))];
      });
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/drafts/rooms/${roomRef.current.id}?rev=${roomRef.current.rev}&after=${lastSeq.current}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as
        { unchanged: true; serverNow: number } | { room: RoomView; events: EventView[] };
      setConnected(true);
      if ("room" in body) apply(body.room, body.events);
      else {
        offset.current = body.serverNow - Date.now();
        setServerNow(body.serverNow);
      }
    } catch {
      setConnected(false);
    }
  }, [apply]);

  // Poll ~1s while visible, slower in the background; resync immediately on refocus.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await poll();
      timer = setTimeout(loop, document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
    };
    timer = setTimeout(loop, POLL_VISIBLE_MS);
    const onVisible = () => !document.hidden && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // Local clock tick for the timer display only (the server decides expiry).
  useEffect(() => {
    if (!room.state.timer.enabled || room.status !== "in_progress") return;
    const id = setInterval(() => {
      offset.current ??= initialRoom.serverNow - Date.now();
      setServerNow(Date.now() + offset.current);
    }, 250);
    return () => clearInterval(id);
  }, [room.state.timer.enabled, room.status, initialRoom.serverNow]);

  // Follow a rematch automatically.
  useEffect(() => {
    if (room.rematchId) router.push(`/draft/rooms/${room.rematchId}`);
  }, [room.rematchId, router]);

  async function post(path: string, body?: unknown): Promise<RoomView | null> {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/drafts/rooms/${room.id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = (await res.json().catch(() => null)) as
        ({ room?: RoomView; roomId?: string } & ApiError) | null;
      if (!res.ok) {
        const stale = json?.error?.details?.room;
        if (stale) apply(stale);
        toast.error(json?.error?.message ?? "Something went wrong.");
        return null;
      }
      if (json?.room) apply(json.room);
      void poll();
      return json?.room ?? null;
    } catch {
      toast.error("Network error. Check your connection.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const state = room.state;
  // One outlook fetch per pick, shared by the outlook panel and the team panels' positions.
  const outlook = useDraftOutlook(room.status === "lobby" ? null : state);
  const positions = useMemo(() => positionsFrom(outlook), [outlook]);
  const rulesetRes = getRuleset(state.rulesetId, state.rulesetVersion);
  const sequence = rulesetRes.ok ? rulesetRes.value.sequence : [];
  const turn = currentTurn(state);
  const time = resolveTime(state, serverNow);
  const mySeat = room.viewer.seat;
  const myTurn =
    room.status === "in_progress" && state.status === "in_progress" && turn?.side === mySeat;
  const unavailable = useMemo(() => {
    const free = new Set(availableHeroes(state, pool));
    return new Set(pool.filter((id) => !free.has(id)));
  }, [state, pool]);

  const choose = (heroId: number) => {
    if (!turn) return;
    void post("actions", {
      action: { type: turn.action, heroId },
      expectedVersion: state.stateVersion,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/draft/rooms/${room.id}`;
  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Couldn't copy.");
    }
  };

  const announcement =
    room.status === "lobby"
      ? "Waiting in the lobby."
      : room.status === "completed"
        ? "Draft complete."
        : turn
          ? `${sideName(turn.side)} to ${turn.action}${myTurn ? ", your turn" : ""}.`
          : "";

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {connected ? (
            <Wifi aria-hidden className="size-3.5 text-win" />
          ) : (
            <WifiOff aria-hidden className="size-3.5 text-loss" />
          )}
          <span role="status">{connected ? "Live" : "Reconnecting…"}</span>
          <span aria-hidden>·</span>
          <span>{rulesetRes.ok ? rulesetRes.value.name : state.rulesetId}</span>
          {state.timer.enabled && <span>· Timer on</span>}
          {!mySeat && <span>· You&apos;re watching</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => copy(shareUrl, "Room link copied")}
          >
            <Link2 className="size-3.5" /> Copy room link
          </Button>
          {room.viewer.isHost && state.timer.enabled && room.status === "in_progress" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                post("actions", {
                  action: { type: state.status === "paused" ? "resume" : "pause" },
                  expectedVersion: state.stateVersion,
                  idempotencyKey: crypto.randomUUID(),
                })
              }
            >
              {state.status === "paused" ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
              {state.status === "paused" ? "Resume" : "Pause"}
            </Button>
          )}
        </div>
      </div>

      {room.status === "lobby" ? (
        <Lobby room={room} busy={busy} post={post} />
      ) : (
        <>
          <div
            className={cn(
              "panel flex flex-wrap items-center justify-between gap-3 px-5 py-4",
              myTurn && "border-gold/50",
            )}
          >
            <div>
              <p className="kicker">
                {room.status === "completed"
                  ? "Draft complete"
                  : `Step ${state.stepIndex + 1} of ${sequence.length}`}
              </p>
              <p className="text-xl font-semibold">
                {room.status === "completed" ? (
                  "Both lineups are locked in"
                ) : turn ? (
                  <>
                    {myTurn ? (
                      <span className="text-gold">Your {turn.action}</span>
                    ) : (
                      <>
                        <span className={turn.side === "radiant" ? "text-win" : "text-loss"}>
                          {room.captains[turn.side]?.name ?? sideName(turn.side)}
                        </span>{" "}
                        {turn.action === "pick" ? "is picking…" : "is banning…"}
                      </>
                    )}
                    {state.status === "paused" && (
                      <span className="text-muted-foreground"> (paused)</span>
                    )}
                  </>
                ) : null}
              </p>
            </div>
            {time.timed && room.status === "in_progress" && (
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
                totalPicks={sequence.filter((s) => s.action === "pick").length / 2}
                totalBans={sequence.filter((s) => s.action === "ban").length / 2}
                activeAction={
                  room.status === "in_progress" && turn?.side === side ? turn.action : null
                }
                isFirst={state.firstSide === side}
                reserveLabel={
                  state.timer.enabled ? seconds(state.timer.reserveRemainingMs[side]) : null
                }
                controller={mySeat ? (side === mySeat ? "you" : undefined) : undefined}
                captainName={room.captains[side]?.name}
                positions={positions}
              />
            ))}
          </div>

          <div className="panel p-3">
            <SequenceStrip
              sequence={sequence}
              firstSide={state.firstSide}
              turns={state.turns}
              stepIndex={state.stepIndex}
              heroes={heroMap}
            />
          </div>

          <DraftOutlookPanel state={state} heroes={heroMap} data={outlook} />

          {room.status === "in_progress" &&
            (mySeat ? (
              <HeroGrid
                heroes={heroes}
                unavailable={unavailable}
                disabled={!myTurn || busy || state.status === "paused"}
                actionLabel={turn?.action ?? "pick"}
                onChoose={choose}
              />
            ) : (
              <p className="panel p-4 text-sm text-muted-foreground">
                You&apos;re watching this draft. Only the two captains can pick and ban.
              </p>
            ))}

          {room.status === "completed" && (
            <div className="space-y-4">
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
              <RoomResultPanel room={room} />
              <div className="panel flex flex-wrap items-center gap-2 p-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    copy(
                      `${window.location.origin}/draft?snapshot=${encodeSnapshot(snapshotOf(state))}`,
                      "Draft link copied",
                    )
                  }
                >
                  <Link2 className="size-3.5" /> Share this draft
                </Button>
                {room.viewer.isHost ? (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => post("rematch")}
                  >
                    <RotateCcw className="size-3.5" /> Rematch (first pick swaps)
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    If the host starts a rematch, you&apos;ll be taken there automatically.
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <RoomLog events={events} heroes={heroMap} />
    </div>
  );
}

function Seat({
  side,
  room,
  busy,
  post,
}: {
  side: Side;
  room: RoomView;
  busy: boolean;
  post: (path: string, body?: unknown) => Promise<RoomView | null>;
}) {
  const captain = room.captains[side];
  const mine = room.viewer.seat === side;
  return (
    <div
      className={cn(
        "panel flex items-center gap-4 p-5",
        side === "radiant" ? "border-win/30" : "border-loss/30",
      )}
    >
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted ring-1 ring-white/10">
        {captain?.avatarUrl ? (
          <Image src={captain.avatarUrl} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <UserRound aria-hidden className="size-6 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("kicker", side === "radiant" ? "text-win" : "text-loss")}>
          {sideName(side)} captain
        </p>
        <p className="truncate text-lg font-semibold">
          {captain ? captain.name : <span className="text-muted-foreground">Open seat</span>}
          {mine && <span className="ml-2 rounded bg-gold/15 px-1.5 text-xs text-gold">You</span>}
        </p>
      </div>
      {!captain && room.viewer.signedIn && !room.viewer.seat && (
        <Button size="sm" disabled={busy} onClick={() => post("join", { side })}>
          Take seat
        </Button>
      )}
      {mine && !room.viewer.isHost && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => post("leave")}>
          Leave seat
        </Button>
      )}
    </div>
  );
}

function Lobby({
  room,
  busy,
  post,
}: {
  room: RoomView;
  busy: boolean;
  post: (path: string, body?: unknown) => Promise<RoomView | null>;
}) {
  const bothSeated = room.captains.radiant && room.captains.dire;
  return (
    <section className="space-y-4" aria-label="Lobby">
      <div className="grid gap-4 md:grid-cols-2">
        <Seat side="radiant" room={room} busy={busy} post={post} />
        <Seat side="dire" room={room} busy={busy} post={post} />
      </div>
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {bothSeated
            ? room.viewer.isHost
              ? "Both captains are here. Start when you're ready."
              : "Both captains are here. Waiting for the host to start."
            : "Send the room link to a friend so they can take the open seat."}
          {!room.viewer.signedIn && (
            <>
              {" "}
              <a href="/api/v1/auth/steam/login" className="text-gold hover:underline">
                Sign in
              </a>{" "}
              to take a seat.
            </>
          )}
        </p>
        {room.viewer.isHost && (
          <Button disabled={!bothSeated || busy} onClick={() => post("start")} className="gap-1.5">
            <Crown className="size-4" /> Start draft
          </Button>
        )}
      </div>
    </section>
  );
}

function RoomLog({ events, heroes }: { events: EventView[]; heroes: Map<number, DraftHero> }) {
  const shown = [...events].reverse().slice(0, 60);
  const describe = (e: EventView): string => {
    const hero = e.heroId !== null ? (heroes.get(e.heroId)?.name ?? `Hero #${e.heroId}`) : null;
    switch (e.kind) {
      case "created":
        return `${e.actor} opened the room`;
      case "joined":
        return `${e.actor} took the ${e.side ? sideName(e.side) : ""} seat`;
      case "left":
        return `${e.actor} left the ${e.side ? sideName(e.side) : ""} seat`;
      case "rematch":
        return `${e.actor} started a rematch`;
      case "draft":
        if (e.type === "start") return `${e.actor} started the draft`;
        if (e.type === "pause") return `${e.actor} paused`;
        if (e.type === "resume") return `${e.actor} resumed`;
        if (e.type === "timeout")
          return `${e.side ? sideName(e.side) : "A captain"} ran out of time`;
        return `${e.actor} ${e.type === "ban" ? "banned" : "picked"} ${hero}`;
    }
  };
  return (
    <section className="panel p-4" aria-label="Room log">
      <h2 className="mb-3 text-sm font-semibold">Room log</h2>
      <ol className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
        {shown.map((e) => (
          <li key={e.sequence} className="flex gap-3">
            <span className="w-8 shrink-0 text-right text-[0.65rem] text-muted-foreground tabular-nums">
              {e.sequence}
            </span>
            <span>{describe(e)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Every move is checked by the server; if two moves arrive at once, only the first counts.
      </p>
    </section>
  );
}

export function RoomNotAvailable() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold">Draft room not found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        It may have expired (rooms close a day after the last move) or the link is wrong.
      </p>
      <Link href="/draft/rooms/new" className="text-sm text-gold hover:underline">
        Open a new room
      </Link>
    </section>
  );
}
