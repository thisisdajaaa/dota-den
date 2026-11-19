import type { MessageTree } from "../../translate";
import type { discord as en } from "../en/discord";

/** Filipino. */
export const discord: MessageTree<typeof en> = {
  bot: {
    help: "Dota Den bot. Libre: `/den me` (linggo mo, form at mga hero), `/den leaderboard` (ranked wins ng server ngayong linggo), `/den lang`, `/den recap` (sumali sa Monday recap ng server), `/den nudges` (stop-loss reminder dito o sa DM). Plus: `/den coach` (AI review ng huling laro mo), `/den ask` (Ask Den), `/den pick` (pick para sa totoong draft). Para sa server admin: `/den setup`. I-link muna ang Discord mo: {url}/account",
    notLinked: "I-link muna ang Discord mo sa Dota Den (ilang segundo lang): {url}",
    serverOnly: "Pang-server ito: gamitin sa isang channel ng server.",
    slowDown: "Dahan-dahan lang, ang dami nang commands. Subukan ulit after a minute.",
    plusOnly:
      "Pang-Dota Den Plus ang command na 'yan. Libre: `/den me`, `/den leaderboard`. Plus: {url}",
    error: "May problema sa side namin. Subukan ulit mamaya.",
    langCurrent:
      "{language} ang language mo sa Dota Den. Palitan gamit ang `/den lang language:` ({choices}); pareho lang ito ng setting sa site.",
    langSet: "Ayan: {language} na ang gamit ng Dota Den sa'yo, dito at sa site.",
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
    coach: {
      title: "AI coach · {hero}",
      strength: "Lakas",
      improve: "I-improve",
      footer: "AI coach: puwede itong magkamali. Galing sa match data mo ang mga numero.",
      no_match:
        "Wala ka pang na-import na laro na mare-review. Maglaro muna, o buksan ang Dota Den para mag-sync.",
      unparsed: "Kailangan munang ma-parse ang replay na ito. I-request sa match page: {url}",
      quota: "Nagamit mo na ang coach review mo ngayong linggo.",
      resting: "Pahinga muna ang coach (ubos na ang AI budget ngayong araw). Subukan ulit mamaya.",
      off: "Hindi pa naka-set up ang AI coach sa Dota Den ngayon.",
      failed: "Hindi naisulat ng coach ang review na ito. Subukan ulit mamaya.",
    },
    ask: {
      footer: "Ask Den · {remaining} sa {limit} na tanong pa ngayong araw (kasama ang sa site)",
      quota:
        "Ubos na ang Ask Den questions mo ngayong araw (kasama ang sa site). Babalik sila pagdating ng hatinggabi, oras sa Manila.",
      fallback:
        "Hindi ito masagot ng Ask Den mula sa data mo. Subukang itanong sa ibang paraan: {url}",
      resting:
        "Pahinga muna ang Ask Den (ubos na ang AI budget ngayong araw). Subukan ulit mamaya.",
      off: "Hindi pa naka-set up ang Ask Den sa Dota Den ngayon.",
      failed: "Hindi makasagot ang Ask Den ngayon. Subukan ulit maya-maya.",
    },
    pick: {
      title: "Pick for me",
      against: "Kalaban: {heroes}",
      noEnemies:
        "Walang binigay na kalaban: ang pinakamagaling mong heroes base sa sarili mong record.",
      you: "ikaw {wins}W {losses}L sa {games}",
      vs: "vs {hero} {points} ({games} games)",
      with: "kasama si {hero} {points} ({games} games)",
      footer:
        "Record mo plus high-rank matchups (win-rate points, inayon sa dami ng games). Hindi ito win chance.",
      footerOwn:
        "Walang high-rank matchups ngayon, kaya sarili mong record lang ito. Hindi ito win chance.",
      unknown:
        "Hindi mahanap ang mga hero na ito: {names}. Piliin sila sa listahan habang nagta-type.",
      none: "Kulang pa ang games mo sa mga hero mo (3 pataas bawat isa). Higit pa sa site: {url}",
      failed: "Hindi makagawa ng picks ngayon. Subukan ulit maya-maya.",
    },
    recap: {
      on: "Kasali ka na sa Monday recap ng server na ito: ranked record mo last week, nakapangalan sa'yo. I-off kahit kailan gamit ang `/den recap on:false`.",
      off: "Hindi ka na kasali sa Monday recap ng server na ito.",
      statusOn: "Kasali ka sa Monday recap ng server na ito.",
      statusOff:
        "Hindi ka kasali sa Monday recap ng server na ito. Sumali gamit ang `/den recap on:true`.",
      serverOff:
        "(Hindi pa naka-on ang recap sa server na ito: puwedeng i-on ng server admin gamit ang `/den setup recap:true`.)",
    },
    nudges: {
      off: "Off na ang nudges: hindi ka na imemessage ng bot tungkol sa tilt o stop-loss.",
      dm: "Nudges sa DM: kapag naabot mo ang stop-loss na sinet mo (at, kapag Plus, losing streak na sabi ng history mo ay nakakasama sa'yo), ide-DM ka ng bot. Notification settings mo pa rin sa site ang masusunod: {url}",
      server:
        "Nudges sa {channel}: doon mapupunta ang stop-loss (at Plus tilt) reminders mo, kasama ang pangalan mo. Notification settings mo pa rin sa site ang masusunod: {url}",
      serverOff:
        "Hindi tumatanggap ng nudges ang server na ito. Puwedeng i-on ng server admin gamit ang `/den setup nudges:true`, o gamitin ang `/den nudges where:dm`.",
      statusOff:
        "Off ang nudges. I-on gamit ang `/den nudges where:dm` (o `where:server` sa server na tumatanggap).",
      statusDm: "Sa DM dumarating ang nudges. Settings: {url}",
      statusServer: "Sa isang server channel napupunta ang nudges. Settings: {url}",
      unavailable: "Hindi pa naka-set up ang nudges sa Dota Den.",
    },
    setup: {
      notAdmin: "Ang may Manage Server lang ang puwedeng mag-set up ng bot dito.",
      unavailable:
        "Hindi pa makapag-post ang bot sa mga channel (hindi pa naka-set up sa side ng Dota Den).",
      recapPlus: "Pang-Dota Den Plus ang Monday server recap ng kung sino ang mag-o-on nito: {url}",
      noChannel: "Pumili ng channel gamit ang `/den setup channel:`.",
      cantPost:
        "Hindi ako makapag-post sa {channel}. Bigyan ang Dota Den bot ng View Channel, Send Messages at Embed Links doon, tapos subukan ulit.",
      hello:
        "Dito magpo-post ang Dota Den: ang Monday recap ng mga miyembrong sumali (`/den recap on:true`) at ang nudges na hiningi ng mga miyembro. {url}",
      saved:
        "Na-save. Channel: {channel} · Monday recap: {recap} · Nudges: {nudges} · Language: {language}",
      yes: "on",
      no: "off",
    },
    weekly: {
      title: "Weekly recap · {from} hanggang {to}",
      summary: "{players} ang naglaro ng {games}: {record}.",
      players: { one: "1 miyembro", other: "{n} na miyembro" },
      games: { one: "1 ranked game", other: "{n} ranked games" },
      hero: "Pinakamadalas: {hero}, {games} ({record})",
      footer:
        "Ranked games, Lunes hanggang Linggo (oras sa Manila), ng mga miyembrong sumali gamit ang /den recap.",
    },
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
    invite: "Idagdag ang bot sa server mo",
    commands:
      "Sa Discord: libre ang `/den me`, `/den leaderboard` at `/den recap`; kasama sa Plus ang `/den coach`, `/den ask` at `/den pick`. Ang server admin ang mag-o-on ng Monday recap gamit ang `/den setup`.",
    nudgesLabel: "Tilt at stop-loss nudges sa Discord",
    nudgesOff: "Off",
    nudgesDm: "Direct message",
    nudgesServer: "Sa isang server channel (sinet gamit ang /den nudges)",
    nudgesHelp:
      "Pinapadala kapag naabot ng laro ang stop-loss na sinet mo (at, kapag Plus, pagkatapos ng losing streak na sabi ng sarili mong history ay nakakasama sa'yo). Notification settings mo sa itaas pa rin ang masusunod. Para sa server channel na lang, gamitin ang `/den nudges where:server` doon.",
    nudgesSaved: "Na-save.",
    nudgesFailed: "Hindi na-save. Subukan ulit.",
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
