import type { MessageTree } from "../../translate";
import type { discord as en } from "../en/discord";

/** Filipino. */
export const discord: MessageTree<typeof en> = {
  bot: {
    help: "Dota Den bot: ipinapakita ng `/den me` ang huling linggo mo, form at mga pinakamadalas na hero; niraranggo ng `/den leaderboard` ang mga naka-link na miyembro ng server na ito ayon sa ranked wins ngayong linggo. I-link muna ang Discord mo: {url}/account",
    notLinked: "I-link muna ang Discord mo sa Dota Den (ilang segundo lang): {url}",
    serverOnly: "Kada server ang leaderboard: gamitin ito sa isang channel ng server.",
    meTitle: "{name} sa Dota Den",
    week: "Huling 7 araw",
    weekValue: "{wins}W {losses}L ({rate}%)",
    noGames: "Wala pang laro",
    form: "Huling 10 laro",
    heroes: "Pinakamadalas (30 araw)",
    record: "{wins}W {losses}L",
    footer: "Mula sa public match data na in-import mo sa Dota Den.",
    boardTitle: "Ranked wins ngayong linggo",
    boardFooter: "Mga naka-link na miyembrong gumamit ng /den sa server na ito. Huling 7 araw.",
    boardEmpty:
      "Wala pang ranked game ngayong linggo mula sa mga naka-link na miyembro rito. Lalabas ang mga miyembro kapag ginamit nila ang /den sa server na ito.",
  },
  link: {
    title: "Discord account",
    description:
      "I-link ang Discord account mo para malaman ng Dota Den bot na ikaw iyan: `/den me` at ang lingguhang leaderboard ng server. Discord name at id mo lang ang nalalaman namin.",
    connect: "Ikonekta ang Discord",
    linkedAs: "Naka-link bilang {name}",
    unlink: "Alisin ang link",
    unlinking: "Inaalis…",
    off: "Hindi pa naka-set up ang pagkonekta ng Discord.",
    outcomes: {
      linked: "Naka-link na ang Discord.",
      denied: "Hindi kinumpirma ng Discord ang link. Subukan ulit.",
      bad_state: "Nag-expire ang link na iyon. Subukan ulit.",
      off: "Hindi pa naka-set up ang pagkonekta ng Discord.",
    },
    failed: "Hindi naalis ang link. Subukan ulit.",
  },
  card: {
    title: "Discord",
    description:
      "I-post ang mga natapos mong match sa isang Discord channel, para makita ng grupo mo kung kumusta ang mga laro mo: panalo o talo, hero, K/D/A at link sa match. Ang mga larong nilaro mo lang pagkatapos mo itong i-set up ang ipo-post, tig-iisang beses.",
    howTo:
      "Sa Discord, buksan ang settings ng channel → Integrations → Webhooks → New Webhook, tapos i-Copy Webhook URL at i-paste dito.",
    urlLabel: "Webhook URL",
    urlPlaceholder: "https://discord.com/api/webhooks/…",
    secretNote:
      "Ingatan ang URL na ito na parang password: puwedeng mag-post sa channel ang sinumang may hawak nito. Hindi na ito ipapakita ulit ng Dota Den.",
    save: "I-save ang webhook",
    saving: "Tinitingnan sa Discord…",
    saved: "Na-save ang webhook. Ipo-post ang mga susunod mong match.",
    saveFailed: "Hindi ma-save ang webhook na iyan.",
    invalid:
      "Hindi iyan Discord webhook URL. Dapat ganito ang itsura: https://discord.com/api/webhooks/…",
    postingTo: "Nagpo-post sa {name}",
    unnamed: "ang Discord webhook mo",
    toggle: "I-post ang mga natapos kong match",
    toggleHelp: "Kapag in-on ulit, ang mga larong lalaruin mo mula noon lang ang ipo-post.",
    turnedOn: "Ipo-post sa Discord ang mga match mo.",
    turnedOff: "Naka-off ang pag-post sa Discord.",
    test: "Magpadala ng test post",
    testSent: "Naipadala ang test post. Tingnan ang channel.",
    testFailed: "Hindi maipadala ang test post.",
    remove: "Tanggalin ang webhook",
    removed: "Natanggal ang webhook.",
    removeFailed: "Hindi matanggal ang webhook. Subukan ulit.",
    replace: "Gumamit ng ibang webhook",
    cancel: "Kanselahin",
    gone: "Sabi ng Discord, na-delete na ang webhook na ito, kaya huminto ang pag-post. Mag-paste ng bagong webhook URL para magsimula ulit.",
    lastPosted: "Huling post: {date}",
    saveToggleFailed: "Hindi ma-save. Subukan ulit.",
  },
  post: {
    title: "{result} · {hero}",
    win: "Panalo",
    loss: "Talo",
    kda: "K / D / A",
    duration: "Haba",
    mode: "Mode",
    queue: "Queue",
    ranked: "Ranked",
    unranked: "Unranked",
    unknownMode: "Hindi alam ang mode",
    solo: "Solo",
    party: "Party",
    partyOf: "Party ng {n}",
    unknownQueue: "Hindi alam",
    heroFallback: "Hero #{id}",
    footer: "Dota Den · Match {id}",
    test: {
      title: "Konektado na ang Dota Den",
      description:
        "Dito lalabas ang mga natapos na match: panalo o talo, hero, K/D/A at link sa match.",
    },
  },
};
