import { ESTIMATE_PER_GAME } from "@/modules/mmr";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import {
  DEFAULT_GAP_MINUTES,
  groupSessions,
  parseSessionId,
  type GapMinutes,
  type PlaySession,
  type SessionMatch,
} from "../domain/session";
import {
  sessionMmr,
  type MmrObservation,
  type RankedGame,
  type SessionMmr,
} from "../domain/session-mmr";
import { placeEarlierNotes, type EarlierNote, type SessionNote } from "../domain/session-note";
import type { SessionNoteInput } from "./contracts";
import type {
  MmrObservationSource,
  SessionMatchSource,
  SessionNoteRepository,
  SessionOwner,
  SessionSettingsRepository,
} from "./ports";

export const SESSIONS_PAGE_SIZE = 10;
/** How many recent notes are checked for ones left behind by a regrouping. */
const RECENT_NOTES_SCAN = 200;

export interface SessionView<M extends SessionMatch = SessionMatch> {
  session: PlaySession<M>;
  mmr: SessionMmr;
}

export interface SessionsPage<M extends SessionMatch = SessionMatch> {
  gapMinutes: GapMinutes;
  /** Imported matches on the account (0 means nothing synced yet). */
  totalMatches: number;
  items: Array<SessionView<M> & { note: SessionNote | null }>;
  totalSessions: number;
  page: number;
  pageCount: number;
  /** Notes whose session no longer exists under the current break length (newest first). */
  earlierNotes: EarlierNote[];
}

export interface SessionDetail<M extends SessionMatch = SessionMatch> extends SessionView<M> {
  gapMinutes: GapMinutes;
  note: SessionNote | null;
  /** Notes saved when this session's games were grouped differently (read-only). */
  earlierNotes: SessionNote[];
  /** Neighbouring sessions for prev/next navigation. */
  olderId: string | null;
  newerId: string | null;
}

export type SessionError = { type: "not_found" };

export class SessionService<M extends SessionMatch = SessionMatch> {
  constructor(
    private readonly deps: {
      matches: SessionMatchSource<M>;
      observations: MmrObservationSource;
      notes: SessionNoteRepository;
      settings: SessionSettingsRepository;
      /** The gap for users who haven't chosen one (SESSION_DEFAULT_GAP_MINUTES). */
      defaultGapMinutes?: GapMinutes;
    },
  ) {}

  async gap(owner: SessionOwner): Promise<GapMinutes> {
    return (
      (await this.deps.settings.getGap(owner.userId)) ??
      this.deps.defaultGapMinutes ??
      DEFAULT_GAP_MINUTES
    );
  }

  setGap(owner: SessionOwner, gapMinutes: GapMinutes, now = new Date()): Promise<void> {
    return this.deps.settings.setGap(owner.userId, gapMinutes, now);
  }

  /** All sessions, newest first, plus what MMR attribution needs. */
  private async load(owner: SessionOwner, gapMinutes: GapMinutes) {
    const [matches, observations] = await Promise.all([
      this.deps.matches.listMatches(owner.accountId32),
      this.deps.observations.list(owner),
    ]);
    const sessions = groupSessions(owner.accountId32, matches, gapMinutes).reverse();
    const rankedGames: RankedGame[] = matches
      .filter((m) => m.ranked)
      .map((m) => ({ matchId: m.matchId, startedAt: m.startedAt }));
    return { matches, sessions, observations, rankedGames };
  }

  private view(
    session: PlaySession<M>,
    observations: MmrObservation[],
    rankedGames: RankedGame[],
  ): SessionView<M> {
    return {
      session,
      mmr: sessionMmr({ session, observations, rankedGames, estimatePerGame: ESTIMATE_PER_GAME }),
    };
  }

  async list(
    owner: SessionOwner,
    page: number,
    pageSize = SESSIONS_PAGE_SIZE,
  ): Promise<SessionsPage<M>> {
    const gapMinutes = await this.gap(owner);
    const { matches, sessions, observations, rankedGames } = await this.load(owner, gapMinutes);
    const pageCount = Math.max(1, Math.ceil(sessions.length / pageSize));
    const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
    const slice = sessions.slice((current - 1) * pageSize, current * pageSize);
    const notes = await this.deps.notes.listForSessions(
      owner.userId,
      slice.map((s) => s.id),
    );
    const bySession = new Map(notes.map((n) => [n.sessionId, n]));
    const earlierNotes = await this.earlierNotes(owner, sessions);
    return {
      gapMinutes,
      totalMatches: matches.length,
      items: slice.map((s) => ({
        ...this.view(s, observations, rankedGames),
        note: bySession.get(s.id) ?? null,
      })),
      totalSessions: sessions.length,
      page: current,
      pageCount,
      earlierNotes,
    };
  }

  private async earlierNotes(
    owner: SessionOwner,
    sessions: readonly PlaySession<M>[],
  ): Promise<EarlierNote[]> {
    const recent = await this.deps.notes.listRecent(
      owner.userId,
      owner.accountId32,
      RECENT_NOTES_SCAN,
    );
    return placeEarlierNotes(recent, sessions);
  }

  /** The newest session, or null when nothing is imported. */
  async latest(owner: SessionOwner): Promise<SessionView<M> | null> {
    const { sessions, observations, rankedGames } = await this.load(owner, await this.gap(owner));
    return sessions[0] ? this.view(sessions[0], observations, rankedGames) : null;
  }

  async detail(owner: SessionOwner, sessionId: string): Promise<SessionDetail<M> | null> {
    // Another account's session id is indistinguishable from a missing one.
    if (parseSessionId(sessionId)?.accountId32 !== owner.accountId32) return null;
    const gapMinutes = await this.gap(owner);
    const { sessions, observations, rankedGames } = await this.load(owner, gapMinutes);
    const i = sessions.findIndex((s) => s.id === sessionId);
    if (i === -1) return null;
    const [note, earlier] = await Promise.all([
      this.deps.notes.get(owner.userId, sessionId),
      this.earlierNotes(owner, sessions),
    ]);
    return {
      ...this.view(sessions[i], observations, rankedGames),
      gapMinutes,
      note,
      earlierNotes: earlier.filter((e) => e.currentSessionId === sessionId).map((e) => e.note),
      newerId: sessions[i - 1]?.id ?? null,
      olderId: sessions[i + 1]?.id ?? null,
    };
  }

  /** Save the owner's note and goal for one of their current sessions. */
  async saveNote(
    owner: SessionOwner,
    sessionId: string,
    input: SessionNoteInput,
    now = new Date(),
  ): Promise<Result<SessionNote, SessionError>> {
    if (parseSessionId(sessionId)?.accountId32 !== owner.accountId32) {
      return err({ type: "not_found" });
    }
    const { sessions } = await this.load(owner, await this.gap(owner));
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return err({ type: "not_found" });
    const saved = await this.deps.notes.upsert({
      userId: owner.userId,
      accountId32: owner.accountId32,
      sessionId,
      matchIds: session.matches.map((m) => m.matchId),
      sessionStartedAt: session.startedAt,
      note: input.note,
      goal: input.goal,
      goalMet: input.goalMet,
      updatedAt: now,
    });
    return ok(saved);
  }
}
