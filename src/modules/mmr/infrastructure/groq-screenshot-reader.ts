import { z } from "zod";
import { parseScreenshotAnswer, type ScreenshotRead } from "../domain/screenshot-read";

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

const PROMPT = [
  "This is a screenshot from Dota 2 (or a photo of the screen).",
  "Find the player's own current MMR: a number from 0 to 15000, usually shown next to the rank medal on the profile or labelled MMR after a ranked game.",
  "Ignore match IDs, gold, damage, levels, timers, prices, player counts and anyone else's numbers.",
  'Reply with JSON only: {"mmr": <number or null>, "seen": "<where you saw it, max 8 words>"}.',
  "If you are not sure which number is the MMR, reply with mmr null.",
].join(" ");

/** Reads an MMR from a screenshot with a vision model on Groq. The image is not stored. */
export class GroqScreenshotReader {
  constructor(
    private readonly opts: {
      apiKey: string;
      model: string;
      fetch?: (url: string, init: RequestInit) => Promise<Response>;
      timeoutMs?: number;
    },
  ) {}

  async read(image: { type: string; base64: string }): Promise<ScreenshotRead | null> {
    const res = await (this.opts.fetch ?? fetch)(GROQ_CHAT_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${this.opts.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.opts.model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${image.type};base64,${image.base64}` },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
    });
    if (!res.ok) return null;
    const parsed = CompletionSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return null;
    return parseScreenshotAnswer(parsed.data.choices[0].message.content);
  }
}
