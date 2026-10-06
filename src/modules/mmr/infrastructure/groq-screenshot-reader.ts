import type { GroqClient } from "@/common/llm/groq-client";
import { parseScreenshotAnswer, type ScreenshotRead } from "../domain/screenshot-read";
import type { ScreenshotReader } from "../mmr.ports";
import { screenshotPrompt } from "./prompts/screenshot.prompt";

/** Reads an MMR from a screenshot with a vision model on Groq. The image is not stored. */
export class GroqScreenshotReader implements ScreenshotReader {
  constructor(
    private readonly client: GroqClient,
    private readonly opts: { model: string; timeoutMs?: number },
  ) {}

  async read(image: { type: string; base64: string }): Promise<ScreenshotRead | null> {
    const res = await this.client.chat(
      [
        {
          role: "user",
          content: [
            { type: "text", text: screenshotPrompt() },
            { type: "image_url", image_url: { url: `data:${image.type};base64,${image.base64}` } },
          ],
        },
      ],
      {
        model: this.opts.model,
        temperature: 0,
        maxTokens: 400,
        timeoutMs: this.opts.timeoutMs ?? 20_000,
      },
    );
    return res.ok ? parseScreenshotAnswer(res.value) : null;
  }
}
