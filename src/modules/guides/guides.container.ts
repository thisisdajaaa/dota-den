import "server-only";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { GuideService } from "./guides.service";
import { OpenDotaGuideSource } from "./infrastructure/opendota-guide-source";

export const guideService = new GuideService({
  source: new OpenDotaGuideSource(openDotaGateway(), openDotaConfig()),
});
