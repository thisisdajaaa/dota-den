import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/common/http/http";
import { logger } from "@/common/logging/logger";
import { rateLimit } from "@/common/http/rate-limit";
import { getCurrentUser } from "@/modules/identity";
import { getScreenshotReader } from "@/modules/mmr/composition";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_TYPES } from "@/modules/mmr/domain/screenshot-read";

/**
 * Read the MMR shown in a screenshot. Returns a suggestion for the MMR dialog; nothing is
 * saved, and the image is only passed to the AI provider, never stored.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Not signed in");
  const reader = getScreenshotReader();
  if (!reader) return apiError("upstream_unavailable", "Reading screenshots isn't set up.");
  if (!(await rateLimit(`mmr-shot:${user.id}`, 10, 60 * 60_000))) {
    return apiError("rate_limited", "That's a lot of screenshots. Try again in a while.");
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return apiError("bad_request", "Attach a screenshot.");
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) {
    return apiError("bad_request", "Use a PNG, JPEG or WebP screenshot.");
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return apiError("bad_request", "That screenshot is too large (max 4 MB).");
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const read = await reader.read({ type: file.type, base64 }).catch((error: unknown) => {
    logger.warn("mmr_screenshot_failed", { error });
    return null;
  });
  if (!read) return apiError("upstream_unavailable", "Couldn't read the screenshot right now.");
  return NextResponse.json(read);
}
