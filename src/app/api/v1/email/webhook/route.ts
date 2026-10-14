import { emailController } from "@/modules/email";

/** Resend's signed delivery events (bounces and spam complaints). */
export const POST = emailController.webhook;
