import { matchesController } from "@/modules/matches";

/** Up to two model calls (an answer and one retry), each with its own time limit. */
export const maxDuration = 60;

export const POST = matchesController.coachReview;
