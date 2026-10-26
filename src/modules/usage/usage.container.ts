import "server-only";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { UsageRepository } from "./repositories/usage.repository";
import { UsageService } from "./usage.service";

export const usageRepository = new UsageRepository(getDb);
export const usageService = new UsageService({ repository: usageRepository, logger });
