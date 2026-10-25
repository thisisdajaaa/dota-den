import type { MessageTree } from "../../translate";
import type { discord as en } from "../en/discord";

/** Cebuano. */
export const discord: MessageTree<typeof en> = {
  bot: {
    help: "Dota Den bot: ang `/den me` nagpakita sa imong miaging semana, form ug labing kanunay nga mga hero; ang `/den leaderboard` nag-ranggo sa mga naka-link nga miyembro niini nga server sumala sa ranked wins karong semanaha. I-link una ang imong Discord: {url}/account",
    notLinked: "I-link una ang imong Discord sa Dota Den (pipila lang ka segundo): {url}",
    serverOnly: "Matag server ang leaderboard: gamita kini sa usa ka channel sa server.",
    meTitle: "{name} sa Dota Den",
    week: "Katapusang 7 ka adlaw",
    weekValue: "{wins}W {losses}L ({rate}%)",
    noGames: "Wala pay duwa",
    form: "Katapusang 10 ka duwa",
    heroes: "Labing kanunay (30 ka adlaw)",
    record: "{wins}W {losses}L",
    footer: "Gikan sa public match data nga imong gi-import sa Dota Den.",
    boardTitle: "Ranked wins karong semanaha",
    boardFooter:
      "Mga naka-link nga miyembro nga migamit og /den niini nga server. Katapusang 7 ka adlaw.",
    boardEmpty:
      "Wala pay ranked nga duwa karong semanaha gikan sa mga naka-link nga miyembro dinhi. Mogawas ang mga miyembro human nila gamiton ang /den niini nga server.",
  },
  link: {
    title: "Discord account",
    description:
      "I-link ang imong Discord account aron mahibaw ang Dota Den bot nga ikaw kana: `/den me` ug ang semanal nga leaderboard sa server. Imong Discord name ug id lang ang among mahibaw-an.",
    connect: "Ikonektar ang Discord",
    linkedAs: "Naka-link isip {name}",
    unlink: "Tangtanga ang link",
    unlinking: "Gitangtang…",
    off: "Wala pa ma-set up ang pagkonektar sa Discord.",
    outcomes: {
      linked: "Naka-link na ang Discord.",
      denied: "Wala gikumpirma sa Discord ang link. Sulayi pag-usab.",
      bad_state: "Na-expire na ang maong link. Sulayi pag-usab.",
      off: "Wala pa ma-set up ang pagkonektar sa Discord.",
    },
    failed: "Wala matangtang ang link. Sulayi pag-usab.",
  },
  card: {
    title: "Discord",
    description:
      "I-post ang imong nahuman nga mga match sa usa ka Discord channel, aron makita sa imong grupo kung kumusta ang imong mga duwa: daog o pildi, hero, K/D/A ug link sa match. Ang mga duwa ra nga imong gidula human nimo kini i-set up ang i-post, kausa matag usa.",
    howTo:
      "Sa Discord, ablihi ang settings sa channel → Integrations → Webhooks → New Webhook, unya i-Copy Webhook URL ug i-paste dinhi.",
    urlLabel: "Webhook URL",
    urlPlaceholder: "https://discord.com/api/webhooks/…",
    secretNote:
      "Bantayi kining URL sama sa password: bisan kinsa nga naa niini makapost sa channel. Dili na kini ipakita pag-usab sa Dota Den.",
    save: "I-save ang webhook",
    saving: "Gisusi sa Discord…",
    saved: "Na-save ang webhook. I-post ang imong sunod nga mga match.",
    saveFailed: "Dili ma-save kanang webhook.",
    invalid: "Dili kana Discord webhook URL. Ingon niini dapat: https://discord.com/api/webhooks/…",
    postingTo: "Nag-post sa {name}",
    unnamed: "imong Discord webhook",
    toggle: "I-post ang akong nahuman nga mga match",
    toggleHelp: "Kung i-on nimo pag-usab, ang mga duwa ra gikan niadto ang i-post.",
    turnedOn: "I-post sa Discord ang imong mga match.",
    turnedOff: "Naka-off ang pag-post sa Discord.",
    test: "Pagpadala og test post",
    testSent: "Napadala ang test post. Tan-awa ang channel.",
    testFailed: "Dili mapadala ang test post.",
    remove: "Tangtanga ang webhook",
    removed: "Natangtang ang webhook.",
    removeFailed: "Dili matangtang ang webhook. Sulayi pag-usab.",
    replace: "Gamit og laing webhook",
    cancel: "Kanselahon",
    gone: "Matod sa Discord, na-delete na kining webhook, mao nga mihunong ang pag-post. Pag-paste og bag-ong webhook URL aron magsugod pag-usab.",
    lastPosted: "Katapusang post: {date}",
    saveToggleFailed: "Dili ma-save. Sulayi pag-usab.",
  },
  post: {
    title: "{result} · {hero}",
    win: "Daog",
    loss: "Pildi",
    kda: "K / D / A",
    duration: "Gitas-on",
    mode: "Mode",
    queue: "Queue",
    ranked: "Ranked",
    unranked: "Unranked",
    unknownMode: "Wala mahibal-i ang mode",
    solo: "Solo",
    party: "Party",
    partyOf: "Party sa {n}",
    unknownQueue: "Wala mahibal-i",
    heroFallback: "Hero #{id}",
    footer: "Dota Den · Match {id}",
    test: {
      title: "Konektado na ang Dota Den",
      description:
        "Diri mogawas ang nahuman nga mga match: daog o pildi, hero, K/D/A ug link sa match.",
    },
  },
};
