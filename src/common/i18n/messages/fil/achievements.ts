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
    streak: {
      title: "Tuloy-tuloy",
      description: {
        one: "Manalo ng 1 ranked game",
        other: "Manalo ng {n} sunod-sunod na ranked game",
      },
    },
    pool: {
      title: "Malawak na pool",
      description: {
        one: "Manalo ng ranked game gamit ang 1 hero",
        other: "Manalo ng ranked game gamit ang {n} hero",
      },
    },
    marathon: {
      title: "Marathon",
      description: {
        one: "Maglaro ng 1 ranked game sa isang session",
        other: "Maglaro ng {n} ranked game sa isang session",
      },
    },
    comeback: {
      title: "Comeback",
      description: {
        one: "Manalo agad pagkatapos ng 3+ sunod-sunod na talo, isang beses",
        other: "Manalo agad pagkatapos ng 3+ sunod-sunod na talo, {n} beses",
      },
    },
    veteran: {
      title: "Beterano",
      description: { one: "Maglaro ng 1 ranked game", other: "Maglaro ng {n} ranked game" },
    },
    journal: {
      title: "Masinop sa tala",
      description: { one: "I-log ang MMR mo sa 1 araw", other: "I-log ang MMR mo sa {n} araw" },
    },
    drafter: {
      title: "Drafter",
      description: { one: "Mag-save ng 1 practice draft", other: "Mag-save ng {n} practice draft" },
    },
    puzzles: {
      title: "Bihasa sa puzzle",
      description: {
        one: "Sagutin ang 1 draft challenge",
        other: "Sagutin ang {n} draft challenge",
      },
    },
  },
};
