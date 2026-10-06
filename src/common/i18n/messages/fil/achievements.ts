import type { MessageTree } from "../../translate";
import type { achievements as en } from "../en/achievements";

export const achievements: MessageTree<typeof en> = {
  kicker: "Mga milestone",
  title: "Mga achievement",
  tiers: "{earned} sa {total} tier",
  itemAria: "{title}: {tier} sa {total} tier",
  allDone: "{value}: tapos na lahat ng tier",
  next: "{value} / {next} para sa susunod na tier",
  items: {
    streak: { title: "Tuloy-tuloy", description: "Manalo ng {n} sunod-sunod na ranked game" },
    pool: { title: "Malawak na pool", description: "Manalo ng ranked game gamit ang {n} hero" },
    marathon: { title: "Marathon", description: "Maglaro ng {n} ranked game sa isang session" },
    comeback: {
      title: "Comeback",
      description: "Manalo agad pagkatapos ng 3+ sunod-sunod na talo, {n} beses",
    },
    veteran: { title: "Beterano", description: "Maglaro ng {n} ranked game" },
    journal: { title: "Masinop sa tala", description: "I-log ang MMR mo sa {n} araw" },
    drafter: { title: "Drafter", description: "Mag-save ng {n} practice draft" },
    puzzles: { title: "Bihasa sa puzzle", description: "Sagutin ang {n} draft challenge" },
  },
};
