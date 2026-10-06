import "server-only";
import { getDb } from "@/common/db/mongo";
import { AnnotationsController } from "./annotations.controller";
import { AnnotationsRepository } from "./annotations.repository";
import { AnnotationsService } from "./annotations.service";

export const annotationsRepository = new AnnotationsRepository(getDb);
export const annotationsService = new AnnotationsService({ repository: annotationsRepository });
export const annotationsController = new AnnotationsController({ service: annotationsService });
