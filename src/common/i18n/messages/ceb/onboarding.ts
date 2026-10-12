import type { MessageTree } from "../../translate";
import type { onboarding as en } from "../en/onboarding";

/** Cebuano. */
export const onboarding: MessageTree<typeof en> = {
  title: "Pagsugod",
  progress: "{done} sa {total} nahuman",
  dismiss: "Itago ang checklist",
  doneLabel: "Nahuman:",
  todoLabel: "Buhaton:",
  steps: {
    matches: {
      title: "Himoang public ang imong match history",
      help: "Sa Dota 2: Settings → Options → Social → Expose Public Match Data. Mogawas diri ang imong mga duwa.",
    },
    mmr: {
      title: "I-log ang imong MMR karon",
      help: "Dili ipaambit sa Dota ang MMR. I-log kini human magduwa aron makita ang tinuod nimong pagsaka.",
    },
    heroes: {
      title: "I-star ang mga hero nga imong gidula",
      help: "Sa page sa patch, i-star ang imong mga hero aron makita kung unsay giusab sa matag patch para nimo.",
    },
    goal: {
      title: "Pagbutang og goal karong semanaha",
      help: "Pili og usa o duha ka butang nga pauswagon; gikan sa imong mga duwa ang progress.",
    },
    notifications: {
      title: "I-on ang mga notification",
      help: "Makadawat og recap sa imong phone human sa matag session.",
    },
  },
};
