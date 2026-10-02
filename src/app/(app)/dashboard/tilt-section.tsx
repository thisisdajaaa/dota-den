import { logger } from "@/lib/logger";
import type { User } from "@/modules/identity/domain/user";
import { getSessionService } from "@/modules/sessions/composition";
import { TiltWarningCard } from "@/modules/sessions/ui/tilt-cards";

async function warningFor(user: User) {
  try {
    const tilt = await (
      await getSessionService()
    ).tilt({ userId: user.id, accountId32: user.accountId32 });
    return tilt.warning;
  } catch (error) {
    logger.warn("tilt_check_failed", { error });
    return null;
  }
}

/** Suggests a break during a losing streak, when the player's own history backs it up. */
export async function TiltSection({ user }: { user: User }) {
  const warning = await warningFor(user);
  return warning ? <TiltWarningCard warning={warning} /> : null;
}
