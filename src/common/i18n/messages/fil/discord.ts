import type { MessageTree } from "../../translate";
import type { discord as en } from "../en/discord";

/** Filipino. */
export const discord: MessageTree<typeof en> = {
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
