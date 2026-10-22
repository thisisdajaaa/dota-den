/** UI copy for the achievements feature. */
export const achievements = {
  kicker: "Milestones",
  title: "Achievements",
  tiers: "{earned} of {total} tiers",
  itemAria: "{title}: {tier} of {total} tiers",
  allDone: "{value}: all tiers done",
  next: "{value} / {next} for the next tier",
  items: {
    streak: {
      title: "On a roll",
      description: { one: "Win a ranked game", other: "Win {n} ranked games in a row" },
    },
    pool: {
      title: "Deep pool",
      description: {
        one: "Win ranked games with 1 hero",
        other: "Win ranked games with {n} heroes",
      },
    },
    marathon: {
      title: "Marathon",
      description: {
        one: "Play 1 ranked game in one session",
        other: "Play {n} ranked games in one session",
      },
    },
    comeback: {
      title: "Comeback",
      description: {
        one: "Win right after 3+ straight losses, once",
        other: "Win right after 3+ straight losses, {n} times",
      },
    },
    veteran: {
      title: "Veteran",
      description: { one: "Play 1 ranked game", other: "Play {n} ranked games" },
    },
    journal: {
      title: "Keeping score",
      description: { one: "Log your MMR on 1 day", other: "Log your MMR on {n} days" },
    },
    drafter: {
      title: "Drafter",
      description: { one: "Save 1 practice draft", other: "Save {n} practice drafts" },
    },
    puzzles: {
      title: "Puzzle solver",
      description: { one: "Answer 1 draft challenge", other: "Answer {n} draft challenges" },
    },
  },
} as const;
