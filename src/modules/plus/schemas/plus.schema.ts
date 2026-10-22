import { z } from "zod";
import { PLANS } from "../domain/plans";

/** GET /api/v1/plus/checkout?plan=monthly|yearly */
export const CheckoutQuerySchema = z.object({ plan: z.enum(PLANS) }).strip();
