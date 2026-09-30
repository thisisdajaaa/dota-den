import "server-only";
import { env } from "@/lib/env";
import { openDotaGateway } from "@/modules/matches/composition";
import { LiveService } from "./application/live-service";
import { OpenDotaLiveSource } from "./infrastructure/opendota-live-source";

export function getLiveService(): LiveService {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return new LiveService({
    source: new OpenDotaLiveSource(openDotaGateway(), {
      baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
      apiKey: OPENDOTA_API_KEY,
    }),
  });
}
