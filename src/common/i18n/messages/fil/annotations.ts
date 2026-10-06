import type { MessageTree } from "../../translate";
import type { annotations as en } from "../en/annotations";

export const annotations: MessageTree<typeof en> = {
  notes: {
    kicker: "Pribado",
    title: "Mga tala mo",
    description:
      "I-tag ang larong ito at tandaan kung bakit ganoon ang kinalabasan. Ikaw lang ang nakakakita nito; puwede mong i-filter ang mga laro mo ayon sa tag mamaya.",
    tagsLabel: "Mga tag sa larong ito",
    removeTag: "Alisin ang tag na {tag}",
    noTags: "Wala pang tag.",
    addLabel: "Magdagdag ng tag",
    addPlaceholder: "Magdagdag ng sariling tag",
    add: "Idagdag",
    note: "Tala",
    notePlaceholder: "hal. Natalo sa mid laban kay Ember; subukan ang Mek nang mas maaga",
    save: "I-save",
    saving: "Sine-save…",
    saved: "Na-save",
    savedToast: "Na-save",
    saveFailed: "Hindi ma-save. Subukan ulit.",
  },
};
