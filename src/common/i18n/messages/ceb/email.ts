import type { MessageTree } from "../../translate";
import type { email as en } from "../en/email";

/** Cebuano. */
export const email: MessageTree<typeof en> = {
  card: {
    title: "Sinemanang email",
    description:
      "Mubong email matag Lunes bahin sa miaging semana: imong ranked record, ang kausaban sa imong MMR kung eksakto, imong mga hero ug usa ka nota kung naay gipakita ang imong mga duwa. Ipadala lang kung nagduwa ka og ranked nianang semanaha.",
    unavailable: "Wala pay email sa Dota Den.",
    label: "Email address",
    placeholder: "ikaw@example.com",
    consent:
      "Para ra sa sinemanang email kining address. Naay unsubscribe link ang matag email, ug mahimo nimo kining hunongon dinhi.",
    subscribe: "Ipadala ang confirmation link",
    sent: "Tan-awa ang imong inbox: nagpadala mi og confirmation link sa {email}.",
    pending:
      "Naghulat sa imong pagkumpirma sa {email}. Ablihi ang link nga among gi-email (molihok kini sulod sa 24 ka oras).",
    resend: "Ipadala pag-usab ang link",
    confirmed: "Naka-on. Ipadala ang sinemanang email sa {email} matag Lunes.",
    unsubscribed:
      "Nag-unsubscribe ka na sa {email}. Pagpadala og bag-ong confirmation link aron magsugod pag-usab.",
    change: "Gamita ang laing address",
    cancel: "Kanselahon",
    stop: "Hunonga ug papasa ang akong address",
    test: "Pagpadala og test email",
    testSent: "Napadala ang test email. Tan-awa ang imong inbox.",
    stopped: "Naka-off na ang sinemanang email. Napapas na ang imong address.",
    failed: "Dili ma-save. Sulayi pag-usab.",
  },
  link: {
    confirmTitle: "Kumpirmaha ang imong sinemanang email",
    confirmText:
      "Kumpirmaha nga gusto nimo ang sinemanang email sa Dota Den sa address nga imong gibutang.",
    confirmButton: "Kumpirmahon",
    confirmed:
      "Nakumpirma na. Moabot ang imong sinemanang email matag Lunes, human sa semana nga nagduwa ka og ranked.",
    unsubscribeTitle: "Mag-unsubscribe",
    unsubscribeText: "Hunonga ang sinemanang email sa Dota Den.",
    unsubscribeButton: "Mag-unsubscribe",
    unsubscribed: "Naka-unsubscribe na ka. Wala nay sinemanang email.",
    invalid: "Dili valid o expired na kining link. Sugdi pag-usab sa imong Account page.",
    stale:
      "Gikan sa mas karaang email kining link. Dumalaha ang sinemanang email sa imong Account page.",
    missing: "Kulang kining link. Kopyaha ang tibuok link gikan sa email.",
    account: "Adto sa imong Account page",
    failed: "Naay nahitabong sayop. Sulayi pag-usab.",
  },
  confirm: {
    subject: "Kumpirmaha ang imong sinemanang email sa Dota Den",
    preheader: "Usa ra ka click aron makadawat sa imong sinemanang recap.",
    heading: "Kumpirmaha ang imong email",
    body: "Naay mihangyo (hinaot ikaw) og sinemanang email sa Dota Den niining address. Kumpirmaha sulod sa 24 ka oras aron magsugod pagdawat niini.",
    action: "Kumpirmahon ang email",
    ignore: "Wala ka mohangyo niini? Ayaw tagda kining email: wala nay laing ipadala.",
  },
  test: {
    subject: "Test: molihok ang imong sinemanang email sa Dota Den",
    preheader: "Ingon niini ang sinemanang email sa imong inbox.",
    heading: "Andam na ang imong sinemanang email",
    body: "Test ra kini. Moabot ang tinuod nga email matag Lunes, human sa semana nga nagduwa ka og ranked, uban ang imong record, imong mga hero ug ang kausaban sa imong MMR kung eksakto.",
  },
  digest: {
    subject: "Imong semana sa Dota: {wins}W {losses}L",
    preheader: "{games} sa miaging semana. Mao kini ang dagan.",
    heading: "Imong semana sa Dota",
    range: "{from} – {to}",
    record: "Ranked record",
    recordValue: "{wins}W {losses}L ({rate})",
    mmr: "Kausaban sa MMR",
    mmrHint:
      "I-log ang imong MMR sa wala pa ug human magduwa aron makita dinhi ang eksaktong kausaban sa imong MMR.",
    mostPlayed: "Kanunay gidula",
    best: "Labing maayong hero",
    heroValue: "{hero}: {wins}W {losses}L",
    heroFallback: "Hero #{id}",
    rankedGames: { one: "1 ka ranked game", other: "{n} ka ranked game" },
    achievement: "Bag-ong achievement sa miaging semana: {title} ({description}).",
    tilt: "Sa miaging semana, napildi ka og {streak} ka sunod-sunod nga ranked game sa usa ka session. Sa imong mga duwa, human sa {k} ka sunod-sunod nga pildi, midaog ka sa {rate} sa {games} ka duwa, kumpara sa {baseline} sa kinatibuk-an.",
    action: "Ablihi ang imong dashboard",
    why: "Nakadawat ka niini kay gi-on nimo ang sinemanang email sa Dota Den.",
    unsubscribe: "Mag-unsubscribe",
    settings: "Mga setting sa email",
  },
};
