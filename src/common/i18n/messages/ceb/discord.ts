import type { MessageTree } from "../../translate";
import type { discord as en } from "../en/discord";

/** Cebuano. */
export const discord: MessageTree<typeof en> = {
  bot: {
    help: "Dota Den bot. Libre: `/den me` (imong semana, form ug mga hero), `/den leaderboard` (ranked wins sa server karong semanaha), `/den lang`, `/den recap` (apil sa Monday recap sa server), `/den nudges` (stop-loss nga pahinumdom diri o sa DM). Plus: `/den coach` (AI review sa imong pinakaulahing dula), `/den ask` (Ask Den), `/den pick` (pick para sa tinuod nga draft). Para sa server admin: `/den setup`. I-link una imong Discord: {url}/account",
    notLinked: "I-link una imong Discord sa Dota Den (pila ra ka segundo): {url}",
    serverOnly: "Pang-server ni: gamita sa usa ka channel sa server.",
    slowDown:
      "Hinay-hinay lang, daghan na kaayo og commands. Sulayi og usab human sa usa ka minuto.",
    plusOnly:
      "Pang-Dota Den Plus kana nga command. Libre: `/den me`, `/den leaderboard`. Plus: {url}",
    error: "Naa'y problema sa among side. Sulayi og usab unya.",
    langCurrent:
      "{language} imong language sa Dota Den. Usba gamit ang `/den lang language:` ({choices}); pareho ra ni sa setting sa site.",
    langSet: "Sige: {language} na ang gamiton sa Dota Den nimo, diri ug sa site.",
    meTitle: "{name} sa Dota Den",
    week: "Ulahing 7 ka adlaw",
    weekValue: "{wins}W {losses}L ({rate}%)",
    noGames: "Wala pay dula",
    form: "Ulahing 10 ka dula",
    heroes: "Kanunay gigamit (30 ka adlaw)",
    record: "{wins}W {losses}L",
    footer: "Gikan sa public match data nga imong gi-import sa Dota Den.",
    boardTitle: "Ranked wins karong semanaha",
    boardFooter:
      "Mga naka-link nga miyembro nga migamit og /den niini nga server. Ulahing 7 ka adlaw.",
    boardEmpty:
      "Wala pay ranked game karong semanaha gikan sa mga naka-link nga miyembro diri. Mogawas ang mga miyembro kung mogamit sila og /den niini nga server.",
    coach: {
      title: "AI coach · {hero}",
      strength: "Kusog",
      improve: "Ayohon",
      footer: "AI coach: mahimo ni masayop. Gikan sa imong match data ang mga numero.",
      no_match:
        "Wala pa kay na-import nga dula nga ma-review. Dula una, o ablihi ang Dota Den aron mo-sync.",
      unparsed: "Kinahanglan una ma-parse ang replay ani. I-request sa match page: {url}",
      quota: "Nagamit na nimo ang coach review karong semanaha.",
      resting:
        "Pahulay sa ang coach (nahurot na ang AI budget karong adlawa). Sulayi og usab unya.",
      off: "Wala pa ma-set up ang AI coach sa Dota Den karon.",
      failed: "Wala masulat sa coach ang review ani. Sulayi og usab unya.",
    },
    ask: {
      footer: "Ask Den · {remaining} sa {limit} ka pangutana pa karong adlawa (apil ang sa site)",
      quota:
        "Nahurot na imong Ask Den nga pangutana karong adlawa (apil ang sa site). Mobalik sila pag-tungang gabii, oras sa Manila.",
      fallback:
        "Dili ni matubag sa Ask Den gikan sa imong data. Sulayi og pangutana sa laing paagi: {url}",
      resting:
        "Pahulay sa ang Ask Den (nahurot na ang AI budget karong adlawa). Sulayi og usab unya.",
      off: "Wala pa ma-set up ang Ask Den sa Dota Den karon.",
      failed: "Dili makatubag ang Ask Den karon. Sulayi og usab unya-unya.",
    },
    pick: {
      title: "Pick for me",
      against: "Kontra: {heroes}",
      noEnemies:
        "Walay gihatag nga kontra: imong labing maayo nga heroes base sa imong kaugalingong record.",
      you: "ikaw {wins}W {losses}L sa {games}",
      vs: "vs {hero} {points} ({games} games)",
      with: "uban si {hero} {points} ({games} games)",
      footer:
        "Imong record ug high-rank matchups (win-rate points, giayo sumala sa gidaghanon sa games). Dili ni win chance.",
      footerOwn:
        "Walay high-rank matchups karon, mao nga imong kaugalingong record ra ni. Dili ni win chance.",
      unknown: "Wala makit-i kini nga mga hero: {names}. Pilia sila sa lista samtang nag-type.",
      none: "Kulang pa imong games sa imong mga hero (3 o labaw matag usa). Dugang sa site: {url}",
      failed: "Dili makahimo og picks karon. Sulayi og usab unya-unya.",
    },
    recap: {
      on: "Apil na ka sa Monday recap niini nga server: imong ranked record sa miaging semana, nakapangalan nimo. I-off bisan kanus-a gamit ang `/den recap on:false`.",
      off: "Dili na ka apil sa Monday recap niini nga server.",
      statusOn: "Apil ka sa Monday recap niini nga server.",
      statusOff:
        "Dili ka apil sa Monday recap niini nga server. Apil gamit ang `/den recap on:true`.",
      serverOff:
        "(Wala pa ma-on ang recap niini nga server: ang server admin maka-on gamit ang `/den setup recap:true`.)",
    },
    nudges: {
      off: "Off na ang nudges: dili na ka i-message sa bot bahin sa tilt o stop-loss.",
      dm: "Nudges sa DM: kung maabot nimo ang stop-loss nga imong gi-set (ug, kung Plus, losing streak nga sumala sa imong history makadaot nimo), i-DM ka sa bot. Imong notification settings sa site gihapon ang masunod: {url}",
      server:
        "Nudges sa {channel}: didto moadto imong stop-loss (ug Plus tilt) nga pahinumdom, uban imong ngalan. Imong notification settings sa site gihapon ang masunod: {url}",
      serverOff:
        "Dili modawat og nudges kini nga server. Ang server admin maka-on gamit ang `/den setup nudges:true`, o gamita ang `/den nudges where:dm`.",
      statusOff:
        "Off ang nudges. I-on gamit ang `/den nudges where:dm` (o `where:server` sa server nga modawat).",
      statusDm: "Sa DM moabot ang nudges. Settings: {url}",
      statusServer: "Sa usa ka server channel moadto ang nudges. Settings: {url}",
      unavailable: "Wala pa ma-set up ang nudges sa Dota Den.",
    },
    setup: {
      notAdmin: "Ang naay Manage Server ra ang maka-set up sa bot diri.",
      unavailable:
        "Dili pa maka-post ang bot sa mga channel (wala pa ma-set up sa side sa Dota Den).",
      recapPlus: "Pang-Dota Den Plus ang Monday server recap sa bisan kinsa nga mo-on niini: {url}",
      noChannel: "Pili og channel gamit ang `/den setup channel:`.",
      cantPost:
        "Dili ko maka-post sa {channel}. Hatagi ang Dota Den bot og View Channel, Send Messages ug Embed Links didto, dayon sulayi og usab.",
      hello:
        "Diri mo-post ang Dota Den: ang Monday recap sa mga miyembro nga miapil (`/den recap on:true`) ug ang nudges nga gipangayo sa mga miyembro. {url}",
      saved:
        "Na-save. Channel: {channel} · Monday recap: {recap} · Nudges: {nudges} · Language: {language}",
      yes: "on",
      no: "off",
    },
    weekly: {
      title: "Weekly recap · {from} hangtod {to}",
      summary: "{players} ang nidula og {games}: {record}.",
      players: { one: "1 ka miyembro", other: "{n} ka miyembro" },
      games: { one: "1 ka ranked game", other: "{n} ka ranked games" },
      hero: "Kanunay gigamit: {hero}, {games} ({record})",
      footer:
        "Ranked games, Lunes hangtod Domingo (oras sa Manila), sa mga miyembro nga miapil gamit ang /den recap.",
    },
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
    invite: "Idugang ang bot sa imong server",
    commands:
      "Sa Discord: libre ang `/den me`, `/den leaderboard` ug `/den recap`; apil sa Plus ang `/den coach`, `/den ask` ug `/den pick`. Ang server admin ang mo-on sa Monday recap gamit ang `/den setup`.",
    nudgesLabel: "Tilt ug stop-loss nga nudges sa Discord",
    nudgesOff: "Off",
    nudgesDm: "Direct message",
    nudgesServer: "Sa usa ka server channel (gi-set gamit ang /den nudges)",
    nudgesHelp:
      "Ipadala kung maabot sa dula ang stop-loss nga imong gi-set (ug, kung Plus, human sa losing streak nga sumala sa imong kaugalingong history makadaot nimo). Imong notification settings sa ibabaw gihapon ang masunod. Para sa server channel hinuon, gamita ang `/den nudges where:server` didto.",
    nudgesSaved: "Na-save.",
    nudgesFailed: "Wala ma-save. Sulayi pag-usab.",
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
