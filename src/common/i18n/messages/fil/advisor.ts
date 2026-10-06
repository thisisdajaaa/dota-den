import type { MessageTree } from "../../translate";
import type { advisor as en } from "../en/advisor";

export const advisor: MessageTree<typeof en> = {
  kicker: "Pool mo",
  kickerRole: "Pool mo · {short} · {name}",
  title: "Mga hero na idadagdag",
  noRole:
    "Maglaro pa ng ilang laro na may lane data para malaman namin kung anong role ang nilalaro mo.",
  unavailable: "Hindi available ang mga mungkahi ngayon. Subukan ulit pagkalipas ng ilang minuto.",
  descNemeses:
    "Malakas sa matataas na rank para sa role mo, inuuna ang mga hero na tumatalo sa mga madalas tumalo sa iyo:",
  descPlain: "Malakas sa matataas na rank para sa role mo, at wala pa sa pool mo.",
  footer:
    "Mula sa huling {days} araw mo, mga bagong high-rank game at pro game. Hinihila papuntang 50% ang win rate mula sa maliliit na sample.",
  none: "Walang mungkahi: nilalaro mo na ang pinakamalalakas na hero para sa role mo.",
  beats: "Tinatalo si",
  beatsDetail: "{rate} sa {games} (natatalo ka kay {hero} nang {lossRate} ng pagkakataon)",
  highRank: "{rate} win rate sa matataas na rank ({games})",
  contest: "Pinili o na-ban sa {rate} ng mga pro draft",
  played: {
    one: "Nalaro mo na ito nang isang beses kamakailan",
    other: "Nalaro mo na ito nang {n} beses kamakailan",
  },
  counts: {
    games: { one: "1 laro", other: "{n} laro" },
    proGames: { one: "1 pro game", other: "{n} pro game" },
  },
};
