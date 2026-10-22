import type { MessageTree } from "../../translate";
import type { system as en } from "../en/system";

export const system: MessageTree<typeof en> = {
  error: {
    title: "May nangyaring mali",
    body: "Sa amin ang problema, hindi sa iyo, at naabisuhan na kami. Subukan ulit maya-maya.",
    globalBody: "Sa amin ang problema, at naabisuhan na kami.",
    retry: "Subukan ulit",
    pageTitle: "May nangyaring mali · Dota Den",
  },
  notFound: {
    title: "Hindi nahanap ang page",
    body: "Sira ang link o nalipat na ang page. Subukan ang isa sa mga ito.",
    home: "Bumalik sa home",
    meta: "Ano ang malakas ngayon",
    pageTitle: "Hindi nahanap ang page",
  },
  shell: {
    skip: "Lumaktaw sa nilalaman",
    menu: "Menu",
    account: "Account {id}",
    player: "Player {id}",
  },
  pwa: { install: "I-install ang app" },
  search: { clear: "I-clear ang search" },
};
