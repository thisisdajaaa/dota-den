import type { MessageTree } from "../../translate";
import type { email as en } from "../en/email";

/** Filipino. */
export const email: MessageTree<typeof en> = {
  card: {
    title: "Lingguhang email",
    description:
      "Maikling email tuwing Lunes tungkol sa nakaraang linggo: ranked record mo, ang pagbabago ng MMR mo kapag eksakto, ang mga hero mo at isang tala kapag may ipinapakita ang mga laro mo. Ipinapadala lang kung naglaro ka ng ranked noong linggong iyon.",
    unavailable: "Wala pang email sa Dota Den.",
    label: "Email address",
    placeholder: "ikaw@example.com",
    consent:
      "Para lang sa lingguhang email ang address na ito. May unsubscribe link ang bawat email, at puwede mo itong ihinto rito.",
    subscribe: "Ipadala ang confirmation link",
    sent: "Tingnan ang inbox mo: nagpadala kami ng confirmation link sa {email}.",
    pending:
      "Hinihintay ang kumpirmasyon mo para sa {email}. Buksan ang link na in-email namin (gumagana ito nang 24 oras).",
    resend: "Ipadala ulit ang link",
    confirmed: "Naka-on. Ipinapadala ang lingguhang email sa {email} tuwing Lunes.",
    unsubscribed:
      "Nag-unsubscribe ka na sa {email}. Magpadala ng bagong confirmation link para magsimula ulit.",
    change: "Gumamit ng ibang address",
    cancel: "Kanselahin",
    stop: "Ihinto at burahin ang address ko",
    test: "Magpadala ng test email",
    testSent: "Naipadala ang test email. Tingnan ang inbox mo.",
    stopped: "Naka-off na ang lingguhang email. Nabura na ang address mo.",
    failed: "Hindi ma-save. Subukan ulit.",
  },
  link: {
    confirmTitle: "Kumpirmahin ang lingguhang email mo",
    confirmText:
      "Kumpirmahin na gusto mo ang lingguhang email ng Dota Den sa address na inilagay mo.",
    confirmButton: "Kumpirmahin",
    confirmed:
      "Nakumpirma na. Darating ang lingguhang email mo tuwing Lunes, pagkatapos ng linggong naglaro ka ng ranked.",
    unsubscribeTitle: "Mag-unsubscribe",
    unsubscribeText: "Ihinto ang lingguhang email ng Dota Den.",
    unsubscribeButton: "Mag-unsubscribe",
    unsubscribed: "Naka-unsubscribe ka na. Wala nang lingguhang email.",
    invalid: "Hindi valid o expired na ang link na ito. Magsimula ulit sa Account page mo.",
    stale:
      "Galing sa mas lumang email ang link na ito. Pamahalaan ang lingguhang email sa Account page mo.",
    missing: "Kulang ang link na ito. Kopyahin ang buong link mula sa email.",
    account: "Pumunta sa Account page mo",
    failed: "May nangyaring mali. Subukan ulit.",
  },
  confirm: {
    subject: "Kumpirmahin ang lingguhang email mo sa Dota Den",
    preheader: "Isang click lang para makatanggap ng lingguhang recap mo.",
    heading: "Kumpirmahin ang email mo",
    body: "May humiling (sana ikaw) ng lingguhang email ng Dota Den sa address na ito. Kumpirmahin sa loob ng 24 oras para magsimulang matanggap ito.",
    action: "Kumpirmahin ang email",
    ignore: "Hindi mo ito hiniling? Huwag pansinin ang email na ito: wala nang ipapadala.",
  },
  test: {
    subject: "Test: gumagana ang lingguhang email mo sa Dota Den",
    preheader: "Ganito ang itsura ng lingguhang email sa inbox mo.",
    heading: "Handa na ang lingguhang email mo",
    body: "Test lang ito. Darating ang totoong email tuwing Lunes, pagkatapos ng linggong naglaro ka ng ranked, kasama ang record mo, ang mga hero mo at ang pagbabago ng MMR mo kapag eksakto.",
  },
  digest: {
    subject: "Ang linggo mo sa Dota: {wins}W {losses}L",
    preheader: "{games} noong nakaraang linggo. Ganito ang naging takbo.",
    heading: "Ang linggo mo sa Dota",
    range: "{from} – {to}",
    record: "Ranked record",
    recordValue: "{wins}W {losses}L ({rate})",
    mmr: "Pagbabago ng MMR",
    mmrHint:
      "I-log ang MMR mo bago at pagkatapos maglaro para makita rito ang eksaktong pagbabago ng MMR mo.",
    mostPlayed: "Pinakamadalas laruin",
    best: "Pinakamahusay na hero",
    heroValue: "{hero}: {wins}W {losses}L",
    heroFallback: "Hero #{id}",
    rankedGames: { one: "1 ranked game", other: "{n} ranked game" },
    achievement: "Bagong achievement noong nakaraang linggo: {title} ({description}).",
    tilt: "Noong nakaraang linggo, natalo ka ng {streak} sunod-sunod na ranked game sa isang session. Sa mga laro mo, pagkatapos ng {k} sunod-sunod na talo, nanalo ka sa {rate} ng {games} laro, kumpara sa {baseline} sa kabuuan.",
    action: "Buksan ang dashboard mo",
    why: "Natatanggap mo ito dahil in-on mo ang lingguhang email sa Dota Den.",
    unsubscribe: "Mag-unsubscribe",
    settings: "Mga setting ng email",
  },
};
