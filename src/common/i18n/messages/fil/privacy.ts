import type { MessageTree } from "../../translate";
import type { privacy as en } from "../en/privacy";

export const privacy: MessageTree<typeof en> = {
  title: "Account",
  kicker: "Settings at data",
  description:
    "Piliin ang mga notification at ang Discord feed mo, i-download ang itinatago ng Dota Den tungkol sa iyo, o i-delete ang account mo at lahat ng iyon.",
  download: {
    title: "I-download ang data mo",
    button: "I-download",
    json: {
      label: "Lahat (JSON)",
      hint: "Account, MMR log, medal, notes, draft, sinusubaybayang player at mga match",
    },
    matches: { label: "Mga match (CSV)", hint: "Isang row bawat na-import na match" },
    mmr: { label: "MMR log (CSV)", hint: "Bawat MMR entry na na-log mo" },
  },
  delete: {
    title: "I-delete ang account mo",
    removes:
      "Tinatanggal ang account mo, mga sign-in, MMR log, medal history, session notes at goals, sinusubaybayang player, draft results at challenge streak, ang Discord webhook mo, at ang mga na-import mong match.",
    friends:
      "Ang mga draft na nilaro mo kasama ang kaibigan ay mananatili sa history nila, pero tanggal na ang pangalan at larawan mo.",
    backups:
      "Itinatago ang encrypted backups nang 30 araw, tapos mawawala na rin doon ang data mo.",
    opendota:
      "Mananatili sa OpenDota ang mga public Dota match mo; kung mag-sign in ka ulit, ii-import ulit ang mga iyon bilang bagong account.",
    confirmBefore: "I-type ang ",
    confirmAfter: " para kumpirmahin",
    deleting: "Dine-delete…",
    button: "I-delete ang account ko",
    failed: "Hindi ma-delete ang account mo ngayon. Walang natanggal; subukan ulit.",
  },
};
