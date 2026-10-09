import type { MessageTree } from "../../translate";
import type { presence as en } from "../en/presence";

export const presence: MessageTree<typeof en> = {
  title: "Mga higala nga nagdula karon",
  count: { one: "1 ka higala sa Dota 2", other: "{n} ka higala sa Dota 2" },
  inMatch: "Naa sa match",
  inGame: "Nagdula og Dota 2",
  watchLive: "Tan-awa nga live",
  viewProfile: "Tan-awa ang profile",
  link: "{name}: {status}. {action}",
  unknownName: "Player {id}",
  source: {
    steam_friends: "Gikan sa imong friends list sa Steam.",
    tracked_and_teammates:
      "Private ang imong friends list sa Steam, mao nga ang mga player nga imong gi-track ug kanunay nimong kauban ang gipakita diri.",
  },
};
