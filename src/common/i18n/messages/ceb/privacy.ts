import type { MessageTree } from "../../translate";
import type { privacy as en } from "../en/privacy";

export const privacy: MessageTree<typeof en> = {
  loading: "Gi-load ang imong account",
  title: "Account",
  kicker: "Settings ug data",
  description:
    "Pilia ang mga notification, ang imong Discord feed ug ang sinemanang email, i-download ang gitipigan sa Dota Den bahin nimo, o i-delete ang imong account ug tanan niini.",
  download: {
    title: "I-download ang imong data",
    button: "I-download",
    json: {
      label: "Tanan (JSON)",
      hint: "Account, MMR log, medal, notes, draft, gisubay nga player ug mga match",
    },
    matches: { label: "Mga match (CSV)", hint: "Usa ka row matag na-import nga match" },
    mmr: { label: "MMR log (CSV)", hint: "Matag MMR entry nga imong gi-log" },
  },
  delete: {
    title: "I-delete ang imong account",
    removes:
      "Tangtangon ang imong account, mga sign-in, MMR log, medal history, session notes ug goals, gisubay nga player, draft results ug challenge streak, ang imong Discord webhook, ug ang imong na-import nga mga match.",
    friends:
      "Ang mga draft nga imong gidula uban sa higala magpabilin sa ilang history, pero tangtang na ang imong ngalan ug hulagway.",
    backups:
      "Ang encrypted backups tipigan og 30 ka adlaw, dayon mawala na pud didto ang imong data.",
    opendota:
      "Ang imong public Dota matches magpabilin sa OpenDota; kung mo-sign in ka pag-usab, i-import kini pag-usab isip bag-ong account.",
    confirmBefore: "I-type ang ",
    confirmAfter: " aron makumpirma",
    deleting: "Gi-delete…",
    button: "I-delete akong account",
    failed: "Dili ma-delete ang imong account karon. Walay natangtang; sulayi pag-usab.",
  },
  /** DRAFT (legal): i-review sa owner (tan-awa ang en/privacy.ts). */
  policy: {
    title: "Palisiya sa privacy",
    kicker: "Legal",
    updated: "Katapusang na-update {date}",
    description:
      "Ang gitipigan sa Dota Den bahin kanimo, unsang mga serbisyo ang nagdumala niini, unsa kadugay kini tipigan ug unsaon kini pag-download o pag-delete.",
    sections: {
      summary: {
        title: "Ang mubo nga bersyon",
        body: "Ang Dota Den kay independiyenteng software para sa mga Dota 2 player. Dili kini konektado o gi-endorso sa Valve Corporation. Ang gikinahanglan lang aron ipakita kanimo ang imong mga duwa ug ang mga tool nga imong gipili ang among gitipigan. Walay ads ug walay analytics o tracking cookie, dili namo ibaligya ang imong data, ug mahimo nimong i-download o i-delete tanan niini mismo sa {account}.",
      },
      signIn: {
        title: "Pag-sign in pinaagi sa Steam",
        body: "Mag-sign in ka sa kaugalingong page sa Steam. Dili gyud namo makita ang imong password sa Steam o ang mga Steam Guard code: ang imong Steam ID lang ang isulti sa Steam kanamo, nga publiko man. Gamit niini, among pangitaon ang imong publikong ngalan ug avatar sa Steam ug ang imong publikong mga Dota 2 match.",
      },
      stored: {
        title: "Ang among gitipigan kung mag-sign in ka",
        body: "Tanan niini nakadugtong sa imong account ug apil sa download sa imong data:",
        items: {
          account:
            "Ang imong account: ang imong Steam ID, ang imong publikong ngalan ug avatar sa Steam, ang imong settings (kinsa ang makakita sa imong profile, time zone, pinulongan) ang mga adlaw nga imong giablihan ang Dota Den, ug pila ka higayon sa usa ka adlaw nimo gigamit ang matag Plus o AI nga feature (ihap lang, aron mahibal-an namo kung unsang mga feature ang angay ipabilin).",
          sessions:
            "Mga sign-in session: usa ka random nga token, nga naka-scramble (hashed) lang kung tipigan. Matapos kini kung mag-sign out ka, o human sa mga 30 ka adlaw nga wala ka mobisita.",
          matches:
            "Ang imong mga match ug stats: publikong data sa match nga gi-import gikan sa OpenDota para sa imong account, mga detalye sa na-parse nga replay kung naa sa OpenDota, ug ang mga summary nga among gikuwenta gikan niini.",
          mmr: "Ang imong MMR journal: ang mga MMR ug note nga ikaw mismo ang nag-log, ug ang imong medal history. Dili gyud namo tag-anon ang imong MMR. Kung pun-on nimo kini gikan sa screenshot, ipadala ang hulagway sa among AI provider aron basahon ang numero ug dili kini tipigan.",
          notes:
            "Ang imong gisulat: session notes, mga tag ug note sa match, senemanang goal ug practice plan.",
          follows:
            "Mga player ug streamer nga imong gisundan, ug ang mga hero ug item sa imong patch watchlist.",
          drafts:
            "Mga draft: ang mga resulta sa imong draft, mga sulay ug streak sa challenge, ug mga draft nga imong gidula sa room uban sa mga higala.",
          groups: "Mga group nga imong gihimo o giapilan, uban sa mga miyembro niini.",
          together:
            "Mga duwa uban sa higala: ang mga match nga imong gidula uban sa ubang Dota Den player, para sa Together page.",
          shares:
            "Mga share link nga imong gihimo: usa ka snapshot sa session o semana nga imong gipaambit, uban sa imong ngalan sa Steam.",
          coach:
            "Mga review sa AI coach nga imong gipangayo, ug pila na ang imong nagamit (para sa libreng allowance).",
        },
      },
      optional: {
        title: "Kung imo lang i-on",
        body: "Naay mga feature nga mas daghan ang tipigan, ug kung imo lang kini i-on:",
        items: {
          notifications:
            "Notifications: ang push address ug mga key sa imong browser, ang ngalan sa browser (user agent), ang mga matang sa notification nga imong gipili ug lista sa among gipadala.",
          email:
            "Senemanang email: ang imong email address, kung nakumpirma na nimo kini ug lista sa among gipadala. Walay ipadala hangtod imo kining kumpirmahon, ug ang matag email naay unsubscribe link.",
          discord:
            "Discord feed: ang Discord webhook nga imong gi-paste (sekreto kini: dili ibalik sa browser o iapil sa imong download) ug lista sa mga match nga among na-post.",
          plus: "Dota Den Plus: ang plan, status ug mga petsa sa renewal sa imong subscription sumala sa among payment provider, ug rekord sa mga billing notice niini. Dili gyud namo makita o tipigan ang detalye sa imong card, ngalan o billing address: naa kana sa among payment provider.",
        },
      },
      visibility: {
        title: "Kinsa ang makakita sa unsa",
        body: "Private isip default ang imong profile ug MMR. Naa ka lang sa publikong Everyone leaderboard kung imo kining i-on; makita ka sa imong mga higala sa Friends board. Makita sa mga miyembro sa usa ka group ang ngalan sa usag usa ug ang stats sa group, ug makita sa bisan kinsa nga naay share link nga imong gihimo ang imong gipaambit. Publiko sa OpenDota ug Steam ang imong mga match bisan unsa pa ang imong pilion dinhi.",
      },
      device: {
        title: "Cookies ug storage sa imong device",
        body: "Mga cookie lang nga gikinahanglan aron mugana ang site ang among gigamit, walay para sa ads o analytics:",
        items: {
          session:
            "Ang dd_session magpabilin kanimo nga naka-sign in (hangtod 30 ka adlaw). Dili kini mabasa sa mga script sa page.",
          signIn:
            "Ang dd_oid_state ug dd_oid_next manalipod sa pag-sign in sa Steam ug mahinumdom kung asang page mobalik (10 ka minuto).",
          language: "Ang dd_lang mahinumdom sa imong pinulongan (1 ka tuig).",
          timeZone:
            "Ang dd_tz mahinumdom sa imong time zone, aron motakdo kanimo ang mga adlaw ug session (1 ka tuig).",
          local:
            "Ang local storage sa imong browser magtipig og pipila ka butang sa imong device lang: mga draft nga imong gi-save sa draft board, progress sa challenge, mga naka-collapse nga section ug mga tip nga imong gisirado.",
        },
      },
      services: {
        title: "Mga serbisyo nga nagdumala sa imong data",
        body: "Kini nga mga serbisyo nagproseso sa data aron modagan ang Dota Den. Ang gikinahanglan lang sa ilang trabaho ang madawat sa matag usa:",
        items: {
          vercel:
            "Ang Vercel ang nag-host sa site ug nagpadagan sa among server. Sama sa ubang web host, makita niini ang imong IP address ug ang mga page nga imong ablihan.",
          mongodb: "Ang MongoDB Atlas ang nagtipig sa among database.",
          upstash:
            "Ang Upstash (Redis ug QStash) ang naghupot sa mubo nga ihap sa request, naka-cache nga publikong data ug mga background job.",
          github: "Ang GitHub ang nagtipig sa naka-encrypt nga matag-gabii nga backup sa database.",
          opendota:
            "Ang OpenDota ang naghatag sa publikong data sa match ug player. Among pangayoon niini ang imong publikong mga match ug profile gamit ang imong account number, ug mahimo namo kining paparson sa replay sa usa sa imong mga match.",
          stratz:
            "Ang STRATZ ang naghatag sa publikong stats sa hero. Walay bisan unsa bahin kanimo ang ipadala niini.",
          steam:
            "Ang Steam (Valve) ang nagdumala sa sign-in ug patch notes, ug mahimo kini mosulti kanamo kung kinsa sa imong mga higala sa Steam ang naa sa duwa karon (kung publiko ang imong friends list). Gikan sa image server sa Steam ang mga avatar.",
          groq: "Ang Groq ang nagpadagan sa among mga AI feature: ang AI draft captain ug review, ang AI match coach ug ang pagbasa sa MMR screenshot. Ang draft, ang mga detalye sa match o ang screenshot ang madawat niini, dili ang imong Steam ID o ngalan.",
          payments:
            "Ang among payment provider ang nagbaligya sa Plus isip merchant of record: kini ang modawat sa bayad, modumala sa tax ug resibo, ug motipig sa imong billing details sumala sa kaugalingon niining privacy policy.",
          resend: "Ang Resend ang nagpadala sa senemanang email, kung nag-sign up ka niini.",
          push: "Ang push service sa imong browser (pananglitan Google, Mozilla o Apple) ang naghatod sa notifications, kung imo kining gi-on.",
          discord:
            "Madawat sa Discord ang mga post sa match para sa webhook nga imong gikonektar, kung naa.",
          streams:
            "Twitch ug Kick: kung naay live stream sa usa ka page, gikan sa ilang site ang player ug mahimo kining mo-set og kaugalingon nilang cookie sumala sa ilang kaugalingong palisiya. Gikan usab sa ilang server ang mga preview sa stream ug hulagway sa channel.",
        },
      },
      logs: {
        title: "Mga log ug proteksyon batok sa abuso",
        body: "Aron mapugngan ang abuso, among ihapon ang mga request matag IP address sulod sa usa ka minuto hangtod usa ka oras, ug dayon papason ang ihap. Ang mga error report magtipig sa page ug sa error sulod sa 30 ka adlaw, dili gyud ang imong mga cookie, ang imong gi-type o ang imong IP address. Naay kaugalingong mubo nga request log ang among host.",
      },
      retention: {
        title: "Unsa kadugay namo kini tipigan",
        body: "Among tipigan ang imong data samtang naa kay account. Ang uban mas sayo nga matapos sa kaugalingon:",
        items: {
          account:
            "Ang imong account ug ang imong gihimo: hangtod imo kining i-delete o ang imong account.",
          sessions: "Mga sign-in session: mga 30 ka adlaw human sa imong katapusang bisita.",
          logs: "Mga lista sa gipadalang notification, email ug Discord post, ug mga billing notice: 90 ka adlaw. Ihap sa paggamit sa mga feature: 90 ka adlaw.",
          caches:
            "Naka-cache nga publikong data: mga draft room sa magkahigala 24 ka oras human sa katapusang lihok, mga player profile 30 ka adlaw, mga summary sa replay hangtod usa ka tuig.",
          backups: "Mga naka-encrypt nga backup: 30 ka adlaw, dayon papason na.",
        },
      },
      control: {
        title: "I-download o i-delete ang imong data",
        body: "Sa {account}, mahimo nimong i-download ang tanan nga among gitipigan bahin kanimo (JSON, o CSV para sa imong mga match ug MMR log), usbon kung kinsa ang makakita sa imong profile, ug i-delete ang imong account. Kung mag-delete ka, matangtang dayon ang imong account ug tanan sa ibabaw. Magpabilin sa history sa imong higala ang mga draft nga inyong gidula nga magkauban, pero matangtang ang imong ngalan ug hulagway, ug mapunta sa pinakadugay nga miyembro ang mga group nga imong gipanag-iya. Mawala ang mga backup sulod sa 30 ka adlaw. Dili ma-cancel sa pag-delete ang Plus subscription: i-cancel una kini sa billing portal. Magpabilin sa OpenDota ang imong publikong mga match.",
      },
      changes: {
        title: "Mga kausaban niini nga palisiya",
        body: "Kung magsugod mi og tipig og bag-o o mogamit og bag-ong serbisyo, among i-update una kini nga page ug ang petsa sa ibabaw.",
      },
    },
  },
};
