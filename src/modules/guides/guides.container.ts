import "server-only";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { GuideService } from "./guides.service";
import { OpenDotaGuideSource } from "./infrastructure/opendota-guide-source";

export const guideService = lazy(
  () => new GuideService({ source: new OpenDotaGuideSource(openDotaGateway(), openDotaConfig()) }),
);
