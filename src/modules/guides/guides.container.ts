import "server-only";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { stratzHeroMatchups } from "@/common/providers/stratz";
import { lazy } from "@/common/utils/lazy";
import { GuideService } from "./guides.service";
import { OpenDotaGuideSource } from "./infrastructure/opendota-guide-source";
import { StratzGuideSource } from "./infrastructure/stratz-guide-source";

export const guideService = lazy(() => {
  const openDota = new OpenDotaGuideSource(openDotaGateway(), openDotaConfig());
  const stratz = stratzHeroMatchups();
  return new GuideService({ source: stratz ? new StratzGuideSource(stratz, openDota) : openDota });
});
