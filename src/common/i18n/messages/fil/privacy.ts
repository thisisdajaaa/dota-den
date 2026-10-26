import type { MessageTree } from "../../translate";
import type { privacy as en } from "../en/privacy";

export const privacy: MessageTree<typeof en> = {
  loading: "Nilo-load ang account mo",
  title: "Account",
  kicker: "Settings at data",
  description:
    "Piliin ang mga notification, ang Discord feed mo at ang lingguhang email, i-download ang itinatago ng Dota Den tungkol sa iyo, o i-delete ang account mo at lahat ng iyon.",
  download: {
    title: "I-download ang data mo",
    button: "I-download",
    json: {
      label: "Lahat (JSON)",
      hint: "Account, MMR log, medal, notes, draft, sinusubaybayang player at mga match",
    },
    matches: { label: "Mga match (CSV)", hint: "Isang row bawat na-import na match" },
    mmr: { label: "MMR log (CSV)", hint: "Bawat MMR entry na na-log mo" },
  },
  delete: {
    title: "I-delete ang account mo",
    removes:
      "Tinatanggal ang account mo, mga sign-in, MMR log, medal history, session notes at goals, sinusubaybayang player, draft results at challenge streak, ang Discord webhook mo, at ang mga na-import mong match.",
    friends:
      "Ang mga draft na nilaro mo kasama ang kaibigan ay mananatili sa history nila, pero tanggal na ang pangalan at larawan mo.",
    backups:
      "Itinatago ang encrypted backups nang 30 araw, tapos mawawala na rin doon ang data mo.",
    opendota:
      "Mananatili sa OpenDota ang mga public Dota match mo; kung mag-sign in ka ulit, ii-import ulit ang mga iyon bilang bagong account.",
    confirmBefore: "I-type ang ",
    confirmAfter: " para kumpirmahin",
    deleting: "Dine-delete…",
    button: "I-delete ang account ko",
    failed: "Hindi ma-delete ang account mo ngayon. Walang natanggal; subukan ulit.",
  },
  /** DRAFT (legal): para i-review ng owner (tingnan ang en/privacy.ts). */
  policy: {
    title: "Patakaran sa privacy",
    kicker: "Legal",
    updated: "Huling na-update {date}",
    description:
      "Ang itinatago ng Dota Den tungkol sa iyo, aling mga serbisyo ang humahawak nito, gaano katagal ito itinatago at paano ito i-download o i-delete.",
    sections: {
      summary: {
        title: "Ang maikling bersyon",
        body: "Ang Dota Den ay hindi opisyal na proyekto ng mga fan para sa mga Dota 2 player. Hindi ito kaugnay o inendorso ng Valve Corporation. Itinatago lang namin ang kailangan para maipakita sa iyo ang mga laro mo at ang mga tool na pinili mong gamitin. Walang ads at walang analytics o tracking cookie, hindi namin ibinebenta ang data mo, at puwede mong i-download o i-delete lahat ng iyon mismo sa {account}.",
      },
      signIn: {
        title: "Pag-sign in gamit ang Steam",
        body: "Nagsa-sign in ka sa sariling page ng Steam. Hindi namin kailanman nakikita ang password mo sa Steam o ang mga Steam Guard code: ang Steam ID mo lang ang sinasabi ng Steam sa amin, na pampubliko naman. Gamit ito, hinahanap namin ang pampublikong pangalan at avatar mo sa Steam at ang mga pampublikong Dota 2 match mo.",
      },
      stored: {
        title: "Ang itinatago namin kapag nag-sign in ka",
        body: "Lahat ng ito ay nakakabit sa account mo at kasama sa download ng data mo:",
        items: {
          account:
            "Ang account mo: ang Steam ID mo, ang pampublikong pangalan at avatar mo sa Steam, ang settings mo (sino ang nakakakita ng profile mo, time zone, wika) ang mga araw na binuksan mo ang Dota Den, at kung ilang beses sa isang araw mo ginamit ang bawat Plus o AI na feature (bilang lang, para malaman namin kung aling mga feature ang sulit panatilihin).",
          sessions:
            "Mga sign-in session: isang random na token, na naka-scramble (hashed) lang kapag itinatago. Natatapos ito kapag nag-sign out ka, o pagkalipas ng mga 30 araw na hindi ka bumibisita.",
          matches:
            "Ang mga match at stats mo: pampublikong data ng match na na-import mula sa OpenDota para sa account mo, mga detalye ng na-parse na replay kapag mayroon ang OpenDota, at ang mga buod na kinukuwenta namin mula rito.",
          mmr: "Ang MMR journal mo: ang mga MMR at note na ikaw mismo ang nag-log, at ang medal history mo. Hindi namin hinuhulaan ang MMR mo. Kung pupunan mo ito mula sa screenshot, ipinapadala ang larawan sa AI provider namin para basahin ang numero at hindi ito itinatago.",
          notes:
            "Ang mga isinusulat mo: session notes, mga tag at note sa match, lingguhang goal at practice plan.",
          follows:
            "Mga player at streamer na sinusundan mo, at ang mga hero at item sa patch watchlist mo.",
          drafts:
            "Mga draft: ang mga resulta ng draft mo, mga sagot at streak sa challenge, at mga draft na nilaro mo sa room kasama ang mga kaibigan.",
          groups: "Mga group na ginawa o sinalihan mo, kasama ang mga miyembro nito.",
          together:
            "Mga laro kasama ang kaibigan: ang mga match na nilaro mo kasama ang ibang Dota Den player, para sa Together page.",
          shares:
            "Mga share link na ginawa mo: isang snapshot ng session o linggong ibinahagi mo, kasama ang pangalan mo sa Steam.",
          coach:
            "Mga review ng AI coach na hiningi mo, at kung ilan na ang nagamit mo (para sa libreng allowance).",
        },
      },
      optional: {
        title: "Kapag in-on mo lang",
        body: "May mga feature na mas marami ang itinatago, at kapag in-on mo lang ang mga ito:",
        items: {
          notifications:
            "Notifications: ang push address at mga key ng browser mo, ang pangalan ng browser (user agent), ang mga uri ng notification na pinili mo at listahan ng mga ipinadala namin.",
          email:
            "Lingguhang email: ang email address mo, kung nakumpirma mo ito at listahan ng mga ipinadala namin. Walang ipinapadala hangga't hindi mo kinukumpirma, at may unsubscribe link ang bawat email.",
          discord:
            "Discord feed: ang Discord webhook na ipinaste mo (sikreto ito: hindi ibinabalik sa browser o isinasama sa download mo) at listahan ng mga match na na-post namin.",
          plus: "Dota Den Plus: ang plan, status at mga petsa ng renewal ng subscription mo ayon sa payment provider namin, at talaan ng mga billing notice nito. Hindi namin nakikita o itinatago ang detalye ng card mo, pangalan o billing address: nasa Lemon Squeezy ang mga iyon.",
        },
      },
      visibility: {
        title: "Sino ang nakakakita ng ano",
        body: "Private bilang default ang profile at MMR mo. Nasa pampublikong Everyone leaderboard ka lang kung in-on mo ito; nakikita ka ng mga kaibigan mo sa Friends board. Nakikita ng mga miyembro ng isang group ang pangalan ng isa't isa at ang stats ng group, at nakikita ng sinumang may share link na ginawa mo ang ibinahagi mo. Pampubliko sa OpenDota at Steam ang mga match mo anuman ang piliin mo rito.",
      },
      device: {
        title: "Cookies at storage sa device mo",
        body: "Mga cookie lang na kailangan para gumana ang site ang ginagamit namin, wala para sa ads o analytics:",
        items: {
          session:
            "Pinapanatili kang naka-sign in ng dd_session (hanggang 30 araw). Hindi ito mababasa ng mga script sa page.",
          signIn:
            "Pinoprotektahan ng dd_oid_state at dd_oid_next ang pag-sign in sa Steam at tinatandaan kung saang page babalik (10 minuto).",
          language: "Tinatandaan ng dd_lang ang wika mo (1 taon).",
          timeZone:
            "Tinatandaan ng dd_tz ang time zone mo, para tugma sa iyo ang mga araw at session (1 taon).",
          local:
            "May ilang bagay na itinatago ang local storage ng browser mo sa device mo lang: mga draft na sine-save mo sa draft board, progress sa challenge, mga naka-collapse na section at mga tip na isinara mo.",
        },
      },
      services: {
        title: "Mga serbisyong humahawak ng data mo",
        body: "Pinoproseso ng mga serbisyong ito ang data para tumakbo ang Dota Den. Ang kailangan lang ng trabaho nila ang natatanggap ng bawat isa:",
        items: {
          vercel:
            "Ang Vercel ang nagho-host ng site at nagpapatakbo ng server namin. Gaya ng ibang web host, nakikita nito ang IP address mo at ang mga page na binubuksan mo.",
          mongodb: "Ang MongoDB Atlas ang nag-iimbak ng database namin.",
          upstash:
            "Ang Upstash (Redis at QStash) ang may hawak ng panandaliang bilang ng request, naka-cache na pampublikong data at mga background job.",
          github: "Ang GitHub ang nag-iimbak ng naka-encrypt na gabi-gabing backup ng database.",
          opendota:
            "Ang OpenDota ang nagbibigay ng pampublikong data ng match at player. Hinihingi namin dito ang mga pampublikong match at profile mo gamit ang account number mo, at puwede naming ipa-parse dito ang replay ng isa sa mga match mo.",
          stratz:
            "Ang STRATZ ang nagbibigay ng pampublikong stats ng hero. Walang tungkol sa iyo ang ipinapadala rito.",
          steam:
            "Ang Steam (Valve) ang humahawak ng sign-in at patch notes, at puwede nitong sabihin sa amin kung sino sa mga kaibigan mo sa Steam ang nasa laro ngayon (kung pampubliko ang friends list mo). Galing sa image server ng Steam ang mga avatar.",
          groq: "Ang Groq ang nagpapatakbo ng mga AI feature namin: ang AI draft captain at review, ang AI match coach at ang pagbasa ng MMR screenshot. Ang draft, ang mga detalye ng match o ang screenshot ang natatanggap nito, hindi ang Steam ID o pangalan mo.",
          lemonSqueezy:
            "Ang Lemon Squeezy ang nagbebenta ng Plus bilang merchant of record: ito ang tumatanggap ng bayad, humahawak ng tax at resibo, at nag-iingat ng billing details mo ayon sa sarili nitong privacy policy.",
          resend: "Ang Resend ang nagpapadala ng lingguhang email, kung nag-sign up ka rito.",
          push: "Ang push service ng browser mo (halimbawa Google, Mozilla o Apple) ang naghahatid ng notifications, kung in-on mo ang mga ito.",
          discord:
            "Natatanggap ng Discord ang mga post ng match para sa webhook na ikinonekta mo, kung mayroon.",
          streams:
            "Twitch at Kick: kapag may live stream sa isang page, galing sa site nila ang player at puwede itong mag-set ng sarili nilang cookie ayon sa sarili nilang patakaran. Galing din sa server nila ang mga preview ng stream at larawan ng channel.",
        },
      },
      logs: {
        title: "Mga log at proteksyon laban sa abuso",
        body: "Para mapigilan ang abuso, binibilang namin ang mga request bawat IP address nang isang minuto hanggang isang oras, at pagkatapos ay binubura ang bilang. Itinatago ng mga error report ang page at ang error nang 30 araw, hindi kailanman ang mga cookie mo, ang tinype mo o ang IP address mo. May sariling panandaliang request log ang host namin.",
      },
      retention: {
        title: "Gaano katagal namin ito itinatago",
        body: "Itinatago namin ang data mo habang may account ka. May ilang mas maagang natatapos nang kusa:",
        items: {
          account:
            "Ang account mo at ang mga ginawa mo: hanggang i-delete mo ang mga ito o ang account mo.",
          sessions: "Mga sign-in session: mga 30 araw pagkatapos ng huling bisita mo.",
          logs: "Mga listahan ng ipinadalang notification, email at Discord post, at mga billing notice: 90 araw. Bilang ng paggamit ng mga feature: 90 araw.",
          caches:
            "Naka-cache na pampublikong data: mga draft room ng magkakaibigan 24 oras pagkatapos ng huling galaw, mga player profile 30 araw, mga buod ng replay hanggang isang taon.",
          backups: "Mga naka-encrypt na backup: 30 araw, tapos binubura na.",
        },
      },
      control: {
        title: "I-download o i-delete ang data mo",
        body: "Sa {account}, puwede mong i-download ang lahat ng itinatago namin tungkol sa iyo (JSON, o CSV para sa mga match at MMR log mo), baguhin kung sino ang nakakakita ng profile mo, at i-delete ang account mo. Kapag nag-delete ka, tinatanggal agad ang account mo at lahat ng nasa itaas. Nananatili sa history ng kaibigan mo ang mga draft na nilaro ninyo nang magkasama, pero tinatanggal ang pangalan at larawan mo, at napupunta sa pinakamatagal na miyembro ang mga group na pagmamay-ari mo. Nawawala ang mga backup sa loob ng 30 araw. Hindi kina-cancel ng pag-delete ang Plus subscription: i-cancel muna ito sa billing portal. Mananatili sa OpenDota ang mga pampublikong match mo.",
      },
      changes: {
        title: "Mga pagbabago sa patakarang ito",
        body: "Kung magsisimula kaming magtago ng bago o gumamit ng bagong serbisyo, ia-update muna namin ang page na ito at ang petsa sa itaas.",
      },
    },
  },
};
