/** UI copy for the achievements feature. */
export const achievements = {
  kicker: "Milestones",
  title: "Achievements",
  tiers: "{earned} of {total} tiers",
  itemAria: "{title}: {tier} of {total} tiers",
  allDone: "{value}: all tiers done",
  next: "{value} / {next} for the next tier",
  items: {
    streak: { title: "On a roll", description: "Win {n} ranked games in a row" },
    pool: { title: "Deep pool", description: "Win ranked games with {n} heroes" },
    marathon: { title: "Marathon", description: "Play {n} ranked games in one session" },
    comeback: { title: "Comeback", description: "Win right after 3+ straight losses, {n} times" },
    veteran: { title: "Veteran", description: "Play {n} ranked games" },
    journal: { title: "Keeping score", description: "Log your MMR on {n} days" },
    drafter: { title: "Drafter", description: "Save {n} practice drafts" },
    puzzles: { title: "Puzzle solver", description: "Answer {n} draft challenges" },
  },
} as const;
