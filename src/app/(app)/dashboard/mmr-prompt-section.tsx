import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import { getMatchQueries } from "@/modules/matches/composition";
import { getMmrJournal } from "@/modules/mmr/composition";
import { logPrompt, type LogPrompt } from "@/modules/mmr/domain/log-prompt";
import { MmrLogPrompt } from "@/modules/mmr/ui/mmr-log-prompt";

/** Without any entry, only recent games prompt a first one (no nagging about old history). */
const FIRST_ENTRY_WINDOW_MS = 3 * 86_400_000;

async function promptFor(user: User): Promise<LogPrompt | null> {
  try {
    const now = new Date();
    const entries = await (
      await getMmrJournal()
    ).list({ userId: user.id, accountId32: user.accountId32 });
    const latest = entries.at(-1) ?? null;
    const games = await (
      await getMatchQueries()
    ).rankedResults(user.accountId32, {
      from: latest?.observedAt ?? new Date(now.getTime() - FIRST_ENTRY_WINDOW_MS),
      to: now,
    });
    return logPrompt(latest && { mmr: latest.mmr, observedAt: latest.observedAt }, games);
  } catch (error) {
    logger.warn("mmr_prompt_failed", { error });
    return null;
  }
}

/** Asks for an MMR entry after ranked games. Renders nothing when there's nothing to ask. */
export async function MmrPromptSection({ user }: { user: User }) {
  const prompt = await promptFor(user);
  if (!prompt) return null;
  return (
    <MmrLogPrompt
      gamesSince={prompt.gamesSince}
      newestGameId={prompt.newestGameId}
      lastMmr={prompt.last?.mmr ?? null}
      exactIfLoggedNow={prompt.exactIfLoggedNow}
    />
  );
}
