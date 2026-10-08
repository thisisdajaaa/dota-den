import type { MessageTree } from "../../translate";
import type { notifications as en } from "../en/notifications";

/** Filipino. */
export const notifications: MessageTree<typeof en> = {
  card: {
    title: "Mga notification",
    description:
      "Makatanggap ng paalala sa device na ito kapag may dapat tingnan: recap ng huling session mo, ng linggo mo, o ng patch na nagbago sa mga hero mo. Ilang beses lang kada linggo, isang beses kada araw pagkatapos mag-sync ng mga laro mo.",
    unavailable: "Wala pang notification sa Dota Den.",
    unsupported: "Hindi kayang magpakita ng notification mula sa mga website ang browser na ito.",
    needsInstall:
      "Sa iPhone at iPad, idagdag muna ang Dota Den sa Home Screen (Share → Add to Home Screen), tapos buksan ito mula roon para i-on ang mga notification.",
    blocked:
      "Naka-block ang mga notification ng Dota Den sa browser na ito. Payagan ang mga ito sa site settings ng browser, tapos i-reload ang page na ito.",
    turnOn: "I-on sa device na ito",
    turnOff: "I-off sa device na ito",
    test: "Magpadala ng test",
    turnedOn: "Naka-on na ang mga notification sa device na ito.",
    turnedOff: "Naka-off na ang mga notification sa device na ito.",
    turnOnFailed: "Hindi ma-on ang mga notification. Subukan ulit.",
    saveFailed: "Hindi ma-save. Subukan ulit.",
    testSent: "Naipadala ang test. Lalabas ito sa loob ng ilang segundo.",
    testFailed: "Hindi maipadala ang test notification.",
    thisDeviceOn: "Naka-on sa device na ito.",
    otherDevices: {
      one: "Naka-on sa 1 pang device.",
      other: "Naka-on sa {n} pang device.",
    },
    kindsTitle: "Ano ang ipapadala (lahat ng device mo)",
  },
  prompt: {
    label: "Mga notification",
    text: "Makatanggap ng recap sa phone mo pagkatapos ng bawat session.",
    action: "I-on ang mga notification",
    dismiss: "Itago ito",
  },
  kinds: {
    session_recap: {
      label: "Recap ng session",
      help: "Pagkatapos ng session: ang record mo at link sa recap.",
    },
    weekly_recap: {
      label: "Recap ng linggo",
      help: "Tuwing Lunes, kung naglaro ka ng ranked noong nakaraang linggo.",
    },
    patch_heroes: {
      label: "Patch na nagbago sa mga hero mo",
      help: "Kapag may bagong patch na nagbago sa mga hero na nilalaro mo.",
    },
  },
  push: {
    session: {
      title: "Huling session: {wins}W {losses}L",
      body: "{games} gamit si {heroes}. Tingnan kung ano ang maganda at ano ang hindi.",
    },
    games: { one: "1 laro", other: "{n} laro" },
    weekly: {
      title: "Ang linggo mo: {wins}W {losses}L",
      body: "{games} noong nakaraang linggo. Tingnan ang recap ng linggo mo.",
    },
    rankedGames: { one: "1 ranked na laro", other: "{n} ranked na laro" },
    patch: {
      title: "Binago ng patch {version} ang mga hero mo",
      body: "Nagbago si {heroes}. Tingnan kung ano ang iba at kumusta ka mula noon.",
    },
    list: "{items} at {last}",
    listMore: "{items} at {more} pa",
    heroFallback: "Hero #{id}",
    test: {
      title: "Gumagana ang mga notification",
      body: "Dito ka makakatanggap mula sa Dota Den. I-tap para buksan ang settings ng notification.",
    },
  },
};
