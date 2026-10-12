import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import { presenceService, type FriendsPlayingDto } from "@/modules/presence";
import { FriendsPlayingStrip } from "@/modules/presence/ui/friends-playing-strip";

/**
 * Friends in Dota 2 right now (Steam presence). Streams behind Suspense; renders nothing when
 * Steam isn't configured, and any failure only hides the strip.
 */
async function playingNow(user: User): Promise<FriendsPlayingDto | null> {
  try {
    return await presenceService.playingNow({
      userId: user.id,
      accountId32: user.accountId32,
      steamId64: user.steamId64,
    });
  } catch (error) {
    logger.warn("friends_playing_section_failed", { error });
    return null;
  }
}

export async function FriendsPlayingSection({ user }: { user: User }) {
  const data = await playingNow(user);
  return data?.enabled ? <FriendsPlayingStrip initial={data} /> : null;
}
