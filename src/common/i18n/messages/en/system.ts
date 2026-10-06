/** UI copy for the system feature (error pages, app shell extras, shared components). */
export const system = {
  error: {
    title: "Something went wrong",
    body: "This is on our side, not yours, and we've been told about it. Try again in a moment.",
    globalBody: "This is on our side, and we've been told about it.",
    retry: "Try again",
    pageTitle: "Something went wrong · Dota Den",
  },
  shell: {
    skip: "Skip to content",
    menu: "Menu",
    account: "Account {id}",
    player: "Player {id}",
  },
  pwa: { install: "Install app" },
  search: { clear: "Clear search" },
} as const;
