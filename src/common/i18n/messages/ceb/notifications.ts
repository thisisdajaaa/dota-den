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
    streamer_live: {
      label: "Nag-live ang streamer (Plus)",
      help: "Pipila ka minuto human mosugod og stream ang channel nga imong gi-follow sa /live. Kausa matag stream.",
    },
    session_live: {
      label: "Live session updates (Plus)",
      help: "Samtang makita ka sa Steam sa Dota: matag nahuman nga duwa uban ang imong record sa session, ug pahibalo kung ang imong kaugalingong history nag-ingon nga mas mahuyang ka kung sunod-sunod ang pildi.",
    },
    coach_review: {
      label: "AI review sa mga bag-ong ranked nga duwa (Plus)",
      help: "Kung adunay bag-ong ranked nga duwa nga makita ang sync, i-review sa AI coach ang pinakabag-o kung na-parse na ang replay, ug sultihan ka dinhi. Kung imong i-off kini, mohunong usab ang awtomatikong mga review.",
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
    sessionLive: {
      title: "{result} sa {hero} · {wins}–{losses} karong session",
      win: "Daog",
      loss: "Pildi",
      body: "Nindot. Padayon lang.",
      bodyLoss: "Bawi sa sunod.",
      tilt: "{losses} ka sunod-sunod nga pildi. Human sa ingon niini nga streak, modaog ka og {after}% sa sunod nga duwa ({games} ka duwa), kumpara sa {baseline}% kasagaran. Basin mas bili ang mubo nga pahulay kaysa sa sunod nga queue.",
    },
    coachReview: {
      title: "Na-review na ang imong duwa sa {hero}",
      body: "{first} · {points} ka coaching point gikan sa imong tinuod nga numero.",
    },
    live: {
      title: "Live na si {name}",
      body: "{title}",
      bodyNoTitle: "Nag-stream karon sa {site}.",
    },
    test: {
      title: "Nagandar ang mga notification",
      body: "Diri ka makadawat gikan sa Dota Den. I-tap aron maablihan ang settings sa notification.",
    },
  },
};
