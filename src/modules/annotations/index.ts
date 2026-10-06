/** Public API of the annotations feature (ADR 0009). */
export {
  annotationsController,
  annotationsRepository,
  annotationsService,
} from "./annotations.container";
export type { AnnotationDto, TagCountDto } from "./dtos/responses/annotation.dto";
