import type { MessageTree } from "../../translate";
import type { advisor as en } from "../en/advisor";

export const advisor: MessageTree<typeof en> = {
  kicker: "Imong pool",
  kickerRole: "Imong pool · {short} · {name}",
  title: "Mga hero nga idugang",
  noRole:
    "Pagdula pa og pipila ka dula nga adunay lane data aron mahibal-an namo kung unsang role ang imong gidula.",
  unavailable: "Dili available ang mga sugyot karon. Sulayi usab human sa pipila ka minuto.",
  descNemeses:
    "Kusgan sa taas nga rank para sa imong role, giuna ang mga hero nga makapildi sa kasagarang mopildi nimo:",
  descPlain: "Kusgan sa taas nga rank para sa imong role, ug wala pa sa imong pool.",
  footer:
    "Gikan sa imong katapusang {days} ka adlaw, mga bag-ong high-rank game ug pro game. Ang win rate gikan sa gagmay nga sample gibira paingon sa 50%.",
  none: "Walay sugyot: gidula na nimo ang labing kusgan nga mga hero para sa imong role.",
  beats: "Makapildi kang",
  beatsDetail: "{rate} sa {games} (napildi ka kang {hero} sa {lossRate} sa higayon)",
  highRank: "{rate} win rate sa taas nga rank ({games})",
  contest: "Gipili o gi-ban sa {rate} sa mga pro draft",
  played: {
    one: "Nadula na nimo kini kausa bag-o lang",
    other: "Nadula na nimo kini og {n} ka beses bag-o lang",
  },
  counts: {
    games: { one: "1 ka dula", other: "{n} ka dula" },
    proGames: { one: "1 ka pro game", other: "{n} ka pro game" },
  },
};
