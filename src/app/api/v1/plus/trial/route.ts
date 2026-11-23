import { plusController } from "@/modules/plus";

/** Starts the signed-in player's free 7-day Plus trial (same-origin): answers when it ends. */
export const POST = plusController.trial;
