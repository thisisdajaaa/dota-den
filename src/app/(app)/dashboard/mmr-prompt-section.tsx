import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import { mmrInsightsService } from "@/modules/mmr";
import type { LogPrompt } from "@/modules/mmr/domain/log-prompt";
import { MmrLogPrompt } from "@/modules/mmr/ui/mmr-log-prompt";

async function promptFor(user: User): Promise<LogPrompt | null> {
  try {
    return await mmrInsightsService.logPrompt({ userId: user.id, accountId32: user.accountId32 });
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
