import type { MessageTree } from "../../translate";
import type { achievements as en } from "../en/achievements";

export const achievements: MessageTree<typeof en> = {
  kicker: "Mga milestone",
  title: "Mga achievement",
  tiers: "{earned} sa {total} ka tier",
  itemAria: "{title}: {tier} sa {total} ka tier",
  allDone: "{value}: nahuman na ang tanang tier",
  next: "{value} / {next} para sa sunod nga tier",
  items: {
    streak: {
      title: "Sige-sige",
      description: {
        one: "Modaog og 1 ka ranked game",
        other: "Modaog og {n} ka sunod-sunod nga ranked game",
      },
    },
    pool: {
      title: "Lapad nga pool",
      description: {
        one: "Modaog og ranked game gamit ang 1 ka hero",
        other: "Modaog og ranked game gamit ang {n} ka hero",
      },
    },
    marathon: {
      title: "Marathon",
      description: {
        one: "Magdula og 1 ka ranked game sa usa ka session",
        other: "Magdula og {n} ka ranked game sa usa ka session",
      },
    },
    comeback: {
      title: "Comeback",
      description: {
        one: "Modaog dayon human sa 3+ ka sunod-sunod nga pildi, makausa",
        other: "Modaog dayon human sa 3+ ka sunod-sunod nga pildi, {n} ka beses",
      },
    },
    veteran: {
      title: "Beterano",
      description: { one: "Magdula og 1 ka ranked game", other: "Magdula og {n} ka ranked game" },
    },
    journal: {
      title: "Kugihan sa listahan",
      description: {
        one: "I-log ang imong MMR sa 1 ka adlaw",
        other: "I-log ang imong MMR sa {n} ka adlaw",
      },
    },
    drafter: {
      title: "Drafter",
      description: {
        one: "Mag-save og 1 ka practice draft",
        other: "Mag-save og {n} ka practice draft",
      },
    },
    puzzles: {
      title: "Batid sa puzzle",
      description: {
        one: "Tubaga ang 1 ka draft challenge",
        other: "Tubaga ang {n} ka draft challenge",
      },
    },
  },
};
