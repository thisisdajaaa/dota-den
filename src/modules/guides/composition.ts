import "server-only";
import { env } from "@/lib/env";
import { openDotaGateway } from "@/modules/matches/composition";
import { GuideService } from "./application/guide-service";
import { OpenDotaGuideSource } from "./infrastructure/opendota-guide-source";

export function getGuideService(): GuideService {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return new GuideService({
    source: new OpenDotaGuideSource(openDotaGateway(), {
      baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
      apiKey: OPENDOTA_API_KEY,
    }),
  });
}
