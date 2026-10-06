import type { MessageTree } from "../../translate";
import type { privacy as en } from "../en/privacy";

export const privacy: MessageTree<typeof en> = {
  title: "Imong data",
  kicker: "Account",
  description:
    "I-download ang gitipigan sa Dota Den bahin nimo, o i-delete ang imong account ug tanan niini.",
  download: {
    title: "I-download ang imong data",
    button: "I-download",
    json: {
      label: "Tanan (JSON)",
      hint: "Account, MMR log, medal, notes, draft, gisubay nga player ug mga match",
    },
    matches: { label: "Mga match (CSV)", hint: "Usa ka row matag na-import nga match" },
    mmr: { label: "MMR log (CSV)", hint: "Matag MMR entry nga imong gi-log" },
  },
  delete: {
    title: "I-delete ang imong account",
    removes:
      "Tangtangon ang imong account, mga sign-in, MMR log, medal history, session notes ug goals, gisubay nga player, draft results ug challenge streak, ug ang imong na-import nga mga match.",
    friends:
      "Ang mga draft nga imong gidula uban sa higala magpabilin sa ilang history, pero tangtang na ang imong ngalan ug hulagway.",
    backups:
      "Ang encrypted backups tipigan og 30 ka adlaw, dayon mawala na pud didto ang imong data.",
    opendota:
      "Ang imong public Dota matches magpabilin sa OpenDota; kung mo-sign in ka pag-usab, i-import kini pag-usab isip bag-ong account.",
    confirmBefore: "I-type ang ",
    confirmAfter: " aron makumpirma",
    deleting: "Gi-delete…",
    button: "I-delete akong account",
    failed: "Dili ma-delete ang imong account karon. Walay natangtang; sulayi pag-usab.",
  },
};
