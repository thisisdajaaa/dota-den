import type { MessageTree } from "../../translate";
import type { annotations as en } from "../en/annotations";

export const annotations: MessageTree<typeof en> = {
  notes: {
    kicker: "Pribado",
    title: "Imong mga nota",
    description:
      "I-tag kini nga duwa ug hinumdumi nganong ingon ato ang nahitabo. Ikaw ra ang makakita niini; pwede nimo i-filter ang imong mga duwa sumala sa tag unya.",
    tagsLabel: "Mga tag niini nga duwa",
    removeTag: "Tangtanga ang tag nga {tag}",
    noTags: "Wala pay tag.",
    addLabel: "Pagdugang og tag",
    addPlaceholder: "Idugang ang imong kaugalingong tag",
    add: "Idugang",
    note: "Nota",
    notePlaceholder: "pananglitan: Napildi sa mid batok kang Ember; sulayi ang Mek nga mas sayo",
    save: "I-save",
    saving: "Gi-save…",
    saved: "Na-save",
    savedToast: "Na-save",
    saveFailed: "Dili ma-save. Sulayi pag-usab.",
  },
};
