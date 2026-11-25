import "server-only";
import { env } from "@/common/config/env";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { ProviderGateway } from "@/common/providers/provider-gateway";
import { sharedGatewayOptions } from "@/common/providers/shared-gateway-options";
import { stratzHeroItems, stratzHeroMatchups } from "@/common/providers/stratz";
import { lazy } from "@/common/utils/lazy";
import { GuideService } from "./guides.service";
import { OpenDotaGuideSource } from "./infrastructure/opendota-guide-source";
import { StratzGuideSource } from "./infrastructure/stratz-guide-source";
import { ValveHeroKit } from "./infrastructure/valve-hero-kit";

// One Valve gateway per server instance so its cache and circuit state are shared.
const globalForGuides = globalThis as typeof globalThis & { __ddGuideValve?: ProviderGateway };

function valveGateway(): ProviderGateway {
  globalForGuides.__ddGuideValve ??= new ProviderGateway({
    name: "valve-herodata",
    ...sharedGatewayOptions("valve", "valve-herodata"),
    timeoutMs: 10_000,
  });
  return globalForGuides.__ddGuideValve;
}

export const guideService = lazy(() => {
  const kit = new ValveHeroKit(valveGateway(), { baseUrl: env().VALVE_DATAFEED_BASE_URL });
  const openDota = new OpenDotaGuideSource(openDotaGateway(), {
    ...openDotaConfig(),
    heroKit: (heroId) => kit.forHero(heroId),
  });
  const stratz = stratzHeroMatchups();
  return new GuideService({
    source: stratz ? new StratzGuideSource(stratz, openDota, stratzHeroItems()) : openDota,
  });
});
