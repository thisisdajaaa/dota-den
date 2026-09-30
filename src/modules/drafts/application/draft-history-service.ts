import { err, ok, type Result } from "@/modules/shared/domain/result";
import {
  headToHead,
  historySideOf,
  outcomeFor,
  type DraftHistoryRecord,
  type ReportedWinner,
} from "../domain/draft-history";
import { otherSide, type DraftRoom, type RoomCaptain } from "../domain/draft-room";
import { getRuleset } from "../domain/rulesets";
import type { CaptainTotals, DraftHistoryRepository, HistoryOpponent } from "./draft-history-ports";
import type {
  HeadToHeadView,
  HistoryEntryView,
  HistoryPageView,
  PublicCaptain,
  RoomResultView,
} from "./history-views";
import { encodeSnapshot, snapshotOf } from "./snapshot";

export const HISTORY_PAGE_SIZE = 20;
/** The head-to-head summary reads at most this many of the newest drafts with one friend. */
export const HEAD_TO_HEAD_CAP = 500;

export type HistoryError =
  { type: "not_found" } | { type: "not_captain" } | { type: "not_completed" };

export interface HistoryActor {
  userId: string;
  name: string;
}

const pub = (c: RoomCaptain): PublicCaptain => ({
  name: c.name,
  avatarUrl: c.avatarUrl,
  accountId32: c.accountId32,
});

/** Permanent draft history for rooms, plus the captains' self-reported game results. */
export class DraftHistoryService {
  private readonly now: () => number;

  constructor(
    private readonly deps: {
      history: DraftHistoryRepository;
      /** Reads a live room (for recording a finished draft the first write missed). */
      getRoom: (roomId: string) => Promise<DraftRoom | null>;
      /** Which of these room ids still exist (rooms expire). */
      existingRoomIds: (roomIds: string[]) => Promise<Set<string>>;
      now?: () => number;
    },
  ) {
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Save a finished room to history. Idempotent: the store keeps one record per room, so
   * concurrent or repeated calls record it exactly once.
   */
  async recordCompleted(room: DraftRoom): Promise<"inserted" | "duplicate" | "skipped"> {
    const { radiant, dire } = room.captains;
    if (room.status !== "completed" || !radiant || !dire) return "skipped";
    let chainId = room.id;
    if (room.rematchOf) {
      const previous = await this.deps.history.get(room.rematchOf);
      chainId = previous?.chainId ?? room.rematchOf;
    }
    const ids = (side: "radiant" | "dire", kind: "picks" | "bans") =>
      room.state.sides[side][kind].map((s) => s.heroId);
    const record: DraftHistoryRecord = {
      roomId: room.id,
      completedAt: room.state.lastEventAt ? new Date(room.state.lastEventAt) : room.lastActivityAt,
      rulesetId: room.state.rulesetId,
      rulesetVersion: room.state.rulesetVersion,
      firstSide: room.state.firstSide,
      captains: { radiant, dire },
      sides: {
        radiant: { picks: ids("radiant", "picks"), bans: ids("radiant", "bans") },
        dire: { picks: ids("dire", "picks"), bans: ids("dire", "bans") },
      },
      snapshot: encodeSnapshot(snapshotOf(room.state)),
      rematchOf: room.rematchOf,
      chainId,
      result: null,
    };
    return this.deps.history.insertOnce(record);
  }

  /** The record for a room, saving it first if the room finished but wasn't saved yet. */
  private async load(roomId: string): Promise<Result<DraftHistoryRecord, HistoryError>> {
    const found = await this.deps.history.get(roomId);
    if (found) return ok(found);
    const room = await this.deps.getRoom(roomId);
    if (!room) return err({ type: "not_found" });
    if (room.status !== "completed") return err({ type: "not_completed" });
    await this.recordCompleted(room);
    const saved = await this.deps.history.get(roomId);
    return saved ? ok(saved) : err({ type: "not_found" });
  }

  async getResult(
    roomId: string,
    viewerUserId: string | null,
  ): Promise<Result<RoomResultView, HistoryError>> {
    const loaded = await this.load(roomId);
    if (!loaded.ok) return loaded;
    return ok(this.resultView(loaded.value, viewerUserId));
  }

  /** Either captain may say who won the real game, and change it later. */
  async reportResult(
    roomId: string,
    actor: HistoryActor,
    winner: ReportedWinner,
  ): Promise<Result<RoomResultView, HistoryError>> {
    const loaded = await this.load(roomId);
    if (!loaded.ok) return loaded;
    if (!historySideOf(loaded.value, actor.userId)) return err({ type: "not_captain" });
    const result = {
      winner,
      setBy: { userId: actor.userId, name: actor.name },
      setAt: new Date(this.now()),
    };
    const saved = await this.deps.history.setResult(roomId, actor.userId, result);
    if (!saved) return err({ type: "not_captain" });
    return ok(this.resultView({ ...loaded.value, result }, actor.userId));
  }

  async list(
    viewerUserId: string,
    opts: { friendAccountId: number | null; page: number },
  ): Promise<HistoryPageView> {
    const page = Math.max(1, Math.floor(opts.page) || 1);
    const { items, total } = await this.deps.history.listForCaptain(viewerUserId, {
      friendAccountId: opts.friendAccountId,
      skip: (page - 1) * HISTORY_PAGE_SIZE,
      limit: HISTORY_PAGE_SIZE,
    });
    const live = items.length
      ? await this.deps.existingRoomIds(items.map((r) => r.roomId))
      : new Set<string>();
    return {
      items: items.flatMap((r) => {
        const view = this.entryView(r, viewerUserId, live.has(r.roomId));
        return view ? [view] : [];
      }),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
    };
  }

  /** Summary of every recorded draft with one friend, or null if there are none. */
  async headToHead(viewerUserId: string, friendAccountId: number): Promise<HeadToHeadView | null> {
    const { items, total } = await this.deps.history.listForCaptain(viewerUserId, {
      friendAccountId,
      skip: 0,
      limit: HEAD_TO_HEAD_CAP,
    });
    const latest = items[0];
    if (!latest) return null;
    const side = historySideOf(latest, viewerUserId);
    if (!side) return null;
    return {
      ...headToHead(items, viewerUserId),
      friend: pub(latest.captains[otherSide(side)]),
      truncated: total > items.length,
    };
  }

  opponents(viewerUserId: string, limit = 50): Promise<HistoryOpponent[]> {
    return this.deps.history.opponents(viewerUserId, limit);
  }

  /** Finished room drafts per captain, with self-reported wins and losses (leaderboards). */
  captainTotals(query: {
    since: Date | null;
    userIds: readonly string[] | null;
  }): Promise<CaptainTotals[]> {
    return this.deps.history.captainTotals(query);
  }

  private resultView(record: DraftHistoryRecord, viewerUserId: string | null): RoomResultView {
    return {
      recorded: true,
      winner: record.result?.winner ?? null,
      setByName: record.result?.setBy.name ?? null,
      setAt: record.result?.setAt.toISOString() ?? null,
      canReport: viewerUserId !== null && historySideOf(record, viewerUserId) !== null,
    };
  }

  private entryView(
    record: DraftHistoryRecord,
    viewerUserId: string,
    roomAvailable: boolean,
  ): HistoryEntryView | null {
    const side = historySideOf(record, viewerUserId);
    if (!side) return null;
    const ruleset = getRuleset(record.rulesetId, record.rulesetVersion);
    const outcome = outcomeFor(record, side);
    return {
      roomId: record.roomId,
      completedAt: record.completedAt.toISOString(),
      rulesetName: ruleset.ok ? ruleset.value.name : record.rulesetId,
      yourSide: side,
      firstSide: record.firstSide,
      you: pub(record.captains[side]),
      opponent: pub(record.captains[otherSide(side)]),
      sides: record.sides,
      snapshot: record.snapshot,
      isRematch: record.rematchOf !== null,
      result:
        record.result && outcome
          ? {
              winner: record.result.winner,
              outcome,
              setByName: record.result.setBy.name,
              setByYou: record.result.setBy.userId === viewerUserId,
              setAt: record.result.setAt.toISOString(),
            }
          : null,
      roomAvailable,
    };
  }
}
