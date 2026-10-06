import "server-only";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { ErrorsController } from "./errors.controller";
import { ErrorsRepository } from "./errors.repository";
import { ErrorsService } from "./errors.service";

export const errorsRepository = new ErrorsRepository(getDb);
export const errorsService = new ErrorsService({ repository: errorsRepository, logger });
export const errorsController = new ErrorsController({ service: errorsService });
