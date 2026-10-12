import type { MessageTree } from "../../translate";
import type { onboarding as en } from "../en/onboarding";

/** Filipino. */
export const onboarding: MessageTree<typeof en> = {
  title: "Magsimula",
  progress: "{done} sa {total} tapos na",
  dismiss: "Itago ang checklist",
  doneLabel: "Tapos:",
  todoLabel: "Gagawin:",
  steps: {
    matches: {
      title: "Gawing public ang match history mo",
      help: "Sa Dota 2: Settings → Options → Social → Expose Public Match Data. Lalabas dito ang mga laro mo.",
    },
    mmr: {
      title: "I-log ang kasalukuyang MMR mo",
      help: "Hindi ibinabahagi ng Dota ang MMR. I-log ito pagkatapos maglaro para makita ang totoong pag-akyat mo.",
    },
    heroes: {
      title: "I-star ang mga hero na nilalaro mo",
      help: "Sa page ng patch, i-star ang mga hero mo para makita ang binabago ng bawat patch para sa iyo.",
    },
    goal: {
      title: "Magtakda ng goal ngayong linggo",
      help: "Pumili ng isa o dalawang bagay na pagbubutihin; galing sa mga laro mo ang progress.",
    },
    notifications: {
      title: "I-on ang mga notification",
      help: "Makatanggap ng recap sa phone mo pagkatapos ng bawat session.",
    },
  },
};
