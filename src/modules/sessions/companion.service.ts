import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { DOTA_APP_ID, gameNews, shouldCheck, type GameNews } from "./domain/companion";
import type { SessionMatch } from "./domain/session";
import type { StopLossSettings } from "./domain/stop-loss";
import type { CompanionStatePort } from "./sessions.ports";

export interface CompanionPlayer {
  userId: string;
  accountId32: number;
  steamId64: string;
  /** Plus with `session_live` on: every finished game is announced. */
  live: boolean;
  /** Their stop-loss when it's on and they want its reminders (free); null otherwise. */
  stopLoss: StopLossSettings | null;
}

export interface CompanionRun {
  players: number;
  inDota: number;
  checked: number;
  announced: number;
}

/**
 * The session companion: every few minutes, finds which players are in Dota (Steam presence,
 * one request per 100), syncs the new games of those who are (or just were), and announces
 * each finished game with the session record and, when their history backs it, a tilt
 * warning (Plus). Anyone with a stop-loss on (free) is reminded, once per rule per session,
 * when a game reaches one of their limits; that reminder replaces the game's announcement.
 * Players who aren't playing cost nothing beyond the presence check.
 */
export class SessionCompanionService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      /**
       * Players with a device to notify and something to send: Plus members with the
       * `session_live` notification on, and anyone with a stop-loss and `stop_loss` on.
       */
      players: () => Promise<CompanionPlayer[]>;
      /** Steam presence: SteamID64 → the app id they're in (null: Steam didn't answer). */
      playing: (steamIds: readonly string[]) => Promise<Map<string, string | null> | null>;
      state: CompanionStatePort;
      sync: (accountId32: number) => Promise<void>;
      matches: (accountId32: number) => Promise<SessionMatch[]>;
      gapMinutes: (userId: string) => Promise<number>;
      notify: (userId: string, news: GameNews) => Promise<number>;
      /** A stop-loss reminder for this game, at most once per rule per session. */
      remind: (userId: string, news: GameNews) => Promise<number>;
      /** Counts a use (admin usage numbers); never fails. */
      used?: (userId: string) => Promise<void>;
      /** Counts a stop-loss reminder sent (admin usage numbers); never fails. */
      reminded?: (userId: string) => Promise<void>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async run(): Promise<CompanionRun> {
    const now = this.now();
    const players = await this.deps.players();
    const run: CompanionRun = { players: players.length, inDota: 0, checked: 0, announced: 0 };
    if (players.length === 0) return run;
    const playing = await this.deps.playing(players.map((p) => p.steamId64));
    if (!playing) return run;
    for (const p of players) {
      try {
        run.announced += await this.forPlayer(
          p,
          playing.get(p.steamId64) === DOTA_APP_ID,
          now,
          run,
        );
      } catch (error) {
        this.deps.logger.warn("session_companion_player_failed", { userId: p.userId, error });
      }
    }
    if (run.checked > 0) this.deps.logger.info("session_companion_run", { ...run });
    return run;
  }

  private async forPlayer(p: CompanionPlayer, inDota: boolean, now: Date, run: CompanionRun) {
    const state = await this.deps.state.get(p.userId);
    if (inDota) {
      run.inDota++;
      state.lastInGameAt = now;
    }
    if (!shouldCheck(state, inDota, now)) {
      if (inDota) await this.deps.state.save(p.userId, state);
      return 0;
    }
    run.checked++;
    // The first time: start from now, so nothing from before is announced.
    if (!state.watermark) {
      await this.deps.state.save(p.userId, { ...state, watermark: now, lastSyncAt: now });
      return 0;
    }
    await this.deps.sync(p.accountId32).catch((error: unknown) => {
      this.deps.logger.warn("session_companion_sync_failed", { userId: p.userId, error });
    });
    state.lastSyncAt = now;
    const [matches, gap] = await Promise.all([
      this.deps.matches(p.accountId32),
      this.deps.gapMinutes(p.userId),
    ]);
    const news = gameNews(matches, gap, state.watermark, now, p.stopLoss);
    let announced = 0;
    for (const n of news) {
      if (n.stopLoss && n.stopLoss.status.reached.length > 0) {
        if ((await this.deps.remind(p.userId, n)) > 0) {
          announced++;
          await this.deps.reminded?.(p.userId);
          continue;
        }
      }
      if (p.live && (await this.deps.notify(p.userId, n)) > 0) {
        announced++;
        await this.deps.used?.(p.userId);
      }
    }
    const newest = matches
      .filter((m) => m.startedAt.getTime() > state.watermark!.getTime())
      .reduce((max, m) => (m.startedAt > max ? m.startedAt : max), state.watermark);
    await this.deps.state.save(p.userId, { ...state, watermark: newest });
    return announced;
  }

  async exportMyData(owner: DataOwner) {
    return { sessionCompanion: await this.deps.state.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { sessionCompanion: await this.deps.state.deleteForOwner(owner) };
  }
}
