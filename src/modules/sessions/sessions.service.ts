import { ESTIMATE_PER_GAME } from "@/modules/mmr/domain/calendar";
import { err, ok, type Result } from "@/common/result";
import {
  DEFAULT_GAP_MINUTES,
  groupSessions,
  parseSessionId,
  type GapMinutes,
  type PlaySession,
  type SessionMatch,
} from "./domain/session";
import { sessionMmr, type MmrObservation, type RankedGame } from "./domain/session-mmr";
import { placeEarlierNotes, type EarlierNote, type SessionNote } from "./domain/session-note";
import { currentLossStreak, tiltStats, tiltWarning } from "./domain/tilt";
import type { SessionNoteInput } from "./schemas/sessions.schema";
import type {
  MmrObservationSource,
  SessionMatchSource,
  SessionNotesPort,
  SessionOwner,
  SessionSettingsPort,
  PersonalDataStore,
} from "./sessions.ports";
import type {
  SessionDetail,
  SessionError,
  SessionView,
  SessionsPage,
} from "./dtos/responses/sessions.dto";

export const SESSIONS_PAGE_SIZE = 10;
/** How many recent notes are checked for ones left behind by a regrouping. */
const RECENT_NOTES_SCAN = 200;

export class SessionService<M extends SessionMatch = SessionMatch> {
  constructor(
    private readonly deps: {
      matches: SessionMatchSource<M>;
      observations: MmrObservationSource;
      notes: SessionNotesPort;
      settings: SessionSettingsPort;
      /** The gap for users who haven't chosen one (SESSION_DEFAULT_GAP_MINUTES). */
      defaultGapMinutes?: GapMinutes;
      /** Needed for "Download your data" and account deletion only. */
      data?: { notes: PersonalDataStore; settings: PersonalDataStore };
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
  /** Sessions with the player's gap (as the Sessions page shows them), ranked games only. */
  async rankedSessions(owner: SessionOwner): Promise<PlaySession<M>[]> {
    const gapMinutes = await this.gap(owner);
    const matches = await this.deps.matches.listMatches(owner.accountId32);
    // Grouped like the Sessions page (all games), then only the ranked games kept.
    return groupSessions(owner.accountId32, matches, gapMinutes)
      .map((session) => ({ ...session, matches: session.matches.filter((m) => m.ranked) }))
      .filter((session) => session.matches.length > 0);
  }

  /** Win rates after losing streaks, and whether the current session is on one. */
  async tilt(owner: SessionOwner, now = new Date()) {
    const gapMinutes = await this.gap(owner);
    const matches = await this.deps.matches.listMatches(owner.accountId32);
    const stats = tiltStats(matches, gapMinutes);
    const streak = currentLossStreak(matches, gapMinutes, now);
    return { stats, streak, warning: tiltWarning(stats, streak), gapMinutes };
  }

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

  async exportMyData(owner: SessionOwner) {
    const data = this.requireData();
    const [notes, settings] = await Promise.all([
      data.notes.exportForOwner(owner),
      data.settings.exportForOwner(owner),
    ]);
    return { sessionNotes: notes, sessionSettings: settings };
  }

  async deleteMyData(owner: SessionOwner) {
    const data = this.requireData();
    const [notes, settings] = await Promise.all([
      data.notes.deleteForOwner(owner),
      data.settings.deleteForOwner(owner),
    ]);
    return { sessionNotes: notes, sessionSettings: settings };
  }

  private requireData() {
    if (!this.deps.data) throw new Error("SessionService was built without its data stores");
    return this.deps.data;
  }
}
