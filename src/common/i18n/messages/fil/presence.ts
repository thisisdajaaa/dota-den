import type { MessageTree } from "../../translate";
import type { presence as en } from "../en/presence";

export const presence: MessageTree<typeof en> = {
  title: "Mga kaibigang naglalaro ngayon",
  count: { one: "1 kaibigan sa Dota 2", other: "{n} kaibigan sa Dota 2" },
  inMatch: "Nasa match",
  inGame: "Naglalaro ng Dota 2",
  watchLive: "Panoorin nang live",
  viewProfile: "Tingnan ang profile",
  link: "{name}: {status}. {action}",
  unknownName: "Player {id}",
  source: {
    steam_friends: "Mula sa friends list mo sa Steam.",
    tracked_and_teammates:
      "Private ang friends list mo sa Steam, kaya ang mga tina-track mo at madalas mong kakampi ang ipinapakita rito.",
  },
};
