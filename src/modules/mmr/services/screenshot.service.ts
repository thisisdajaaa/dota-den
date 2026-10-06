import { UpstreamUnavailableError, ValidationError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import {
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_TYPES,
  type ScreenshotRead,
} from "../domain/screenshot-read";
import type { ScreenshotReader } from "../mmr.ports";

/**
 * Reads the MMR shown in a screenshot, as a suggestion for the MMR dialog. Nothing is saved;
 * the image only goes to the AI provider and is never stored.
 */
export class ScreenshotService {
  constructor(
    private readonly deps: { reader: ScreenshotReader | null; logger: Pick<Logger, "warn"> },
  ) {}

  get available(): boolean {
    return this.deps.reader !== null;
  }

  async read(file: {
    type: string;
    size: number;
    bytes: () => Promise<ArrayBuffer>;
  }): Promise<ScreenshotRead> {
    const { reader } = this.deps;
    if (!reader) throw new UpstreamUnavailableError("Reading screenshots isn't set up.");
    if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type))
      throw new ValidationError("Use a PNG, JPEG or WebP screenshot.");
    if (file.size > MAX_SCREENSHOT_BYTES)
      throw new ValidationError("That screenshot is too large (max 4 MB).");
    const base64 = Buffer.from(await file.bytes()).toString("base64");
    const read = await reader.read({ type: file.type, base64 }).catch((error: unknown) => {
      this.deps.logger.warn("mmr_screenshot_failed", { error });
      return null;
    });
    if (!read) throw new UpstreamUnavailableError("Couldn't read the screenshot right now.");
    return read;
  }
}
