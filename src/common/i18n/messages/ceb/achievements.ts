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
    streak: { title: "Sige-sige", description: "Modaog og {n} ka sunod-sunod nga ranked game" },
    pool: { title: "Lapad nga pool", description: "Modaog og ranked game gamit ang {n} ka hero" },
    marathon: {
      title: "Marathon",
      description: "Magdula og {n} ka ranked game sa usa ka session",
    },
    comeback: {
      title: "Comeback",
      description: "Modaog dayon human sa 3+ ka sunod-sunod nga pildi, {n} ka beses",
    },
    veteran: { title: "Beterano", description: "Magdula og {n} ka ranked game" },
    journal: { title: "Kugihan sa listahan", description: "I-log ang imong MMR sa {n} ka adlaw" },
    drafter: { title: "Drafter", description: "Mag-save og {n} ka practice draft" },
    puzzles: { title: "Batid sa puzzle", description: "Tubaga ang {n} ka draft challenge" },
  },
};
