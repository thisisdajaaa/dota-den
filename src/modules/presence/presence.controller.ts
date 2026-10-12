import "server-only";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import type { PresenceService } from "./presence.service";

export class PresenceController {
  constructor(private readonly deps: { service: PresenceService }) {}

  /** GET /api/v1/me/friends/playing: friends in Dota 2 now (polled by the overview strip). */
  playing = handler(
    {
      guard: requireUser,
      // The strip polls once a minute per open tab; this leaves room for a few tabs.
      rateLimit: { name: "presence:playing", limit: 20, windowMs: 60_000, local: true },
    },
    async ({ user }) => {
      const data = await this.deps.service.playingNow({
        userId: user.id,
        accountId32: user.accountId32,
        steamId64: user.steamId64,
      });
      // Presence of other people: never cached by browsers or proxies.
      return ServiceResponse.success(data).withHeaders({ "cache-control": "private, no-store" });
    },
  );
}
