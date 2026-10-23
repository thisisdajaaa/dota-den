import { plusController } from "@/modules/plus";

/** Payment provider webhooks (ADR 0013). 404 unless a provider is configured. */
export const POST = plusController.webhook;
