import type { MessageTree } from "../../translate";
import type { system as en } from "../en/system";

export const system: MessageTree<typeof en> = {
  error: {
    title: "Naay sayop nga nahitabo",
    body: "Sa amoa ang problema, dili sa imo, ug nahibal-an na namo. Sulayi pag-usab unya-unya.",
    globalBody: "Sa amoa ang problema, ug nahibal-an na namo.",
    retry: "Sulayi pag-usab",
    pageTitle: "Naay sayop nga nahitabo · Dota Den",
  },
  notFound: {
    title: "Wala makit-i ang page",
    body: "Guba ang link o nabalhin na ang page. Sulayi ang usa niini.",
    home: "Balik sa home",
    meta: "Unsa ang kusgan karon",
    pageTitle: "Wala makit-i ang page",
  },
  shell: {
    skip: "Laktaw sa sulod",
    account: "Account {id}",
    player: "Player {id}",
  },
  pwa: { install: "I-install ang app" },
  search: { clear: "I-clear ang search" },
};
