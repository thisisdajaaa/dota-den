/** What the vision model is asked about an MMR screenshot (pure, so it can be tested). */
export function screenshotPrompt(): string {
  return [
    "This is a screenshot from Dota 2 (or a photo of the screen).",
    "Find the player's own current MMR: a number from 0 to 15000, usually shown next to the rank medal on the profile or labelled MMR after a ranked game.",
    "Ignore match IDs, gold, damage, levels, timers, prices, player counts and anyone else's numbers.",
    'Reply with JSON only: {"mmr": <number or null>, "seen": "<where you saw it, max 8 words>"}.',
    "If you are not sure which number is the MMR, reply with mmr null.",
  ].join(" ");
}
