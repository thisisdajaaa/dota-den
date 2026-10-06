import type { z } from "zod";
import type { SaveAnnotationSchema } from "../../schemas/save-annotation.schema";

export type SaveAnnotationDto = z.infer<typeof SaveAnnotationSchema>;
