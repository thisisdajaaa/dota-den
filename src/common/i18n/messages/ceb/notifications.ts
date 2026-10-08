import type { MessageTree } from "../../translate";
import type { notifications as en } from "../en/notifications";

/** Cebuano. */
export const notifications: MessageTree<typeof en> = {
  card: {
    title: "Mga notification",
    description:
      "Makadawat og pahinumdom niining device kung naay angay tan-awon: recap sa imong katapusang session, sa imong semana, o sa patch nga nag-usab sa imong mga hero. Pipila ra ka higayon kada semana, kausa kada adlaw human ma-sync ang imong mga duwa.",
    unavailable: "Wala pay notification sa Dota Den.",
    unsupported: "Dili makapakita og notification gikan sa mga website kining browser.",
    needsInstall:
      "Sa iPhone ug iPad, idugang una ang Dota Den sa Home Screen (Share → Add to Home Screen), unya ablihi kini gikan didto aron ma-on ang mga notification.",
    blocked:
      "Naka-block ang mga notification sa Dota Den niining browser. Tugoti kini sa site settings sa browser, unya i-reload kining page.",
    turnOn: "I-on niining device",
    turnOff: "I-off niining device",
    test: "Pagpadala og test",
    turnedOn: "Naka-on na ang mga notification niining device.",
    turnedOff: "Naka-off na ang mga notification niining device.",
    turnOnFailed: "Dili ma-on ang mga notification. Sulayi pag-usab.",
    saveFailed: "Dili ma-save. Sulayi pag-usab.",
    testSent: "Napadala ang test. Mogawas kini sulod sa pipila ka segundo.",
    testFailed: "Dili mapadala ang test notification.",
    thisDeviceOn: "Naka-on niining device.",
    otherDevices: {
      one: "Naka-on sa 1 pa ka device.",
      other: "Naka-on sa {n} pa ka device.",
    },
    kindsTitle: "Unsa ang ipadala (tanan nimong device)",
  },
  prompt: {
    label: "Mga notification",
    text: "Makadawat og recap sa imong phone human sa matag session.",
    action: "I-on ang mga notification",
    dismiss: "Itago kini",
  },
  kinds: {
    session_recap: {
      label: "Recap sa session",
      help: "Human sa session: ang imong record ug link sa recap.",
    },
    weekly_recap: {
      label: "Recap sa semana",
      help: "Matag Lunes, kung nag-ranked ka sa miaging semana.",
    },
    patch_heroes: {
      label: "Patch nga nag-usab sa imong mga hero",
      help: "Kung naay bag-ong patch nga nag-usab sa mga hero nga imong gidula.",
    },
  },
  push: {
    session: {
      title: "Katapusang session: {wins}W {losses}L",
      body: "{games} gamit si {heroes}. Tan-awa kung unsay nindot ug unsay dili.",
    },
    games: { one: "1 ka duwa", other: "{n} ka duwa" },
    weekly: {
      title: "Imong semana: {wins}W {losses}L",
      body: "{games} sa miaging semana. Tan-awa ang recap sa imong semana.",
    },
    rankedGames: { one: "1 ka ranked nga duwa", other: "{n} ka ranked nga duwa" },
    patch: {
      title: "Giusab sa patch {version} ang imong mga hero",
      body: "Nausab si {heroes}. Tan-awa kung unsay lahi ug kumusta ka sukad niadto.",
    },
    list: "{items} ug {last}",
    listMore: "{items} ug {more} pa",
    heroFallback: "Hero #{id}",
    test: {
      title: "Nagandar ang mga notification",
      body: "Diri ka makadawat gikan sa Dota Den. I-tap aron maablihan ang settings sa notification.",
    },
  },
};
