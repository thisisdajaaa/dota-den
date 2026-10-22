/** UI copy for the system feature (error pages, app shell extras, shared components). */
export const system = {
  error: {
    title: "Something went wrong",
    body: "This is on our side, not yours, and we've been told about it. Try again in a moment.",
    globalBody: "This is on our side, and we've been told about it.",
    retry: "Try again",
    home: "Go home",
    pageTitle: "Something went wrong · Dota Den",
  },
  notFound: {
    title: "Page not found",
    body: "This link is broken or the page has moved. Try one of these instead.",
    home: "Go home",
    meta: "What's strong now",
    pageTitle: "Page not found",
  },
  shell: {
    skip: "Skip to content",
    account: "Account {id}",
    player: "Player {id}",
  },
  pwa: { install: "Install app" },
  search: { clear: "Clear search" },
} as const;
