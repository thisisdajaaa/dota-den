import type { MessageTree } from "../../translate";
import type { plus as en } from "../en/plus";

/** DRAFT (legal): ang `terms` at `refunds` ay draft pa para i-review ng owner (tingnan ang en/plus.ts). */
export const plus: MessageTree<typeof en> = {
  badge: {
    label: "Plus",
    title: "Supporter ng Dota Den Plus",
  },
  page: {
    title: "Dota Den Plus",
    kicker: "Suportahan ang Dota Den",
    lead: "Lahat ng libre ngayon ay mananatiling libre. Ang Plus ay paraan para mapanatiling tumatakbo ang Dota Den, may kaunting dagdag para sa mga player na tumutulong.",
    comingSoonTitle: "Malapit na ang Plus",
    comingSoonBody:
      "Inihahanda pa namin ang bayaran. Wala pang binebenta, at walang gamit mo ngayon ang ila-lock sa likod nito.",
    pausedTitle: "Naka-pause ang mga bagong subscription",
    pausedBody:
      "Hindi ka muna makakapagsimula ng Plus ngayon. Kung naka-subscribe ka na, puwede mo pa rin itong i-manage o i-cancel sa account page mo.",
    freeTitle: "Libre para sa lahat, palagi",
    free: {
      matches: "Match history, mga session, mga hero at ang mga report mo",
      mmr: "MMR journal at rank journey",
      draft: "Draft practice, AI captain, mga challenge at room",
      community: "Mga grupo, together stats, tracked players at leaderboards",
      live: "Mga live na laro, stream at fina-follow na streamer",
      notifications: "Mga notification para sa session, linggo at patch",
      coach: "AI match coach: isang bagong review ng sarili mong na-parse na match kada linggo",
    },
    plusTitle: "Ano ang dagdag ng Plus",
    perks: {
      coach: {
        title: "Walang limit na AI coach",
        body: "Coach review ng kahit anong na-parse mong match, kahit ilang beses (libre: isang bagong review kada linggo). Mula lang sa mga numero ng match na iyon ito isinusulat, at puwede itong magkamali.",
      },
      sync: {
        title: "Priority sync",
        body: "Mas mabilis ma-import ang mahabang match history: mas maikling paghihintay at mas malalaking batch, at ipinapa-parse sa OpenDota ang pinakabago mong hindi pa na-parse na laro (hanggang 3 kada sync). Iisang OpenDota budget pa rin ang gamit ng lahat, kaya hindi bumabagal ang mga libreng player.",
      },
      alerts: {
        title: "Alerto kapag nag-live",
        body: "Notification sa loob ng ilang minuto kapag nag-stream ang streamer na fina-follow mo sa /live. Isang beses kada stream, at puwede mo itong i-off.",
      },
      badge: {
        title: "Supporter badge",
        body: "Maliit na Plus badge sa tabi ng pangalan mo sa app at sa leaderboards.",
      },
      limits: {
        title: "Mas maraming puwang",
        body: "Mag-track ng hanggang {players} player, mag-follow ng {streamers} channel at sumali sa {groups} grupo (doble ng libreng limit).",
      },
      thanks: {
        title: "Manatiling independent",
        body: "May gastos buwan-buwan ang server, data at AI. Ang Plus ang nagbabayad dito, nang walang ads.",
      },
    },
    monthly: "Buwanan",
    yearly: "Taunan",
    perMonth: "kada buwan",
    perYear: "kada taon",
    yearlySaving: "Mga 37% na mas mura kaysa buwanan",
    subscribe: "Kumuha ng Plus",
    subscribeMonthly: "Kumuha ng Plus buwanan",
    subscribeYearly: "Kumuha ng Plus taunan",
    signIn: "Mag-sign in gamit ang Steam para makakuha ng Plus",
    youHavePlus: "May Plus ka na. Salamat!",
    manage: "I-manage ang plan mo",
    notes: {
      currency:
        "Nasa US dollar ang mga presyo. Puwedeng ipakita ng checkout ito sa lokal mong pera, kasama ang sales tax o VAT kung mayroon.",
      provider:
        "Ang Lemon Squeezy, ang aming merchant of record, ang humahawak ng bayad. Sila ang tumatanggap ng bayad, naniningil ng tax at nagpapadala ng resibo. Hindi nakikita ng Dota Den ang card mo.",
      cancel:
        "Puwedeng mag-cancel kahit kailan sa billing portal. May Plus ka pa rin hanggang matapos ang period na binayaran mo.",
    },
    faqTitle: "Mga tanong",
    faq: {
      freeQ: "Magiging bayad ba ang kahit anong libre ngayon?",
      freeA:
        "Hindi. Nagdadagdag lang ang Plus. Kung may libreng feature man na kailangang magbago, hindi ito para pilitin kang magbayad.",
      cancelQ: "Ano ang mangyayari kapag nag-cancel ako?",
      cancelA:
        "Walang magbabago hanggang matapos ang buwan o taon na binayaran mo. Pagkatapos, babalik sa libre ang account mo, at maiiwan ang data mo.",
      failQ: "Paano kung pumalya ang bayad?",
      failA:
        "May Plus ka pa rin nang 7 araw habang sinusubukan ulit ng payment provider ang card mo. I-update ang card mo sa billing portal para hindi ito mawala.",
      limitsQ: "Ano ang mangyayari sa mga dagdag kong follow kapag natapos ang Plus?",
      limitsA:
        "Walang mabubura. Hindi ka lang makakapagdagdag hangga't hindi ka bumababa sa libreng limit.",
    },
    legal: "Basahin ang {terms} at ang {refunds}.",
    termsLink: "mga tuntunin",
    refundsLink: "patakaran sa refund",
  },
  card: {
    title: "Ang plan mo",
    free: "Libre",
    freeBody: "Nasa libreng plan ka: lahat ng libreng feature ay mananatiling libre.",
    plusName: "Dota Den Plus",
    see: "Tingnan ang dagdag ng Plus",
    manage: "I-manage o i-cancel",
    manageHint: "Bubuksan ang billing portal ng aming payment provider.",
    renews: "Magre-renew sa {date}",
    trial: "Trial",
    cancelled: "Na-cancel na. May Plus ka pa hanggang {date}.",
    grace:
      "Pumalya ang huli mong bayad. I-update ang card mo bago mag-{date} para manatili ang Plus.",
    ended: "Natapos na ang Plus subscription mo.",
    paused: "Naka-pause ang Plus subscription mo.",
    disabled:
      "Naka-off muna ang mga Plus feature sa Dota Den ngayon. Hindi apektado ang subscription mo.",
    alertsOn: "Naka-on ang alerto kapag nag-live sa Notifications sa ibaba.",
    status: {
      on_trial: "Trial",
      active: "Aktibo",
      paused: "Naka-pause",
      past_due: "Pumalya ang bayad",
      unpaid: "Hindi bayad",
      cancelled: "Na-cancel",
      expired: "Natapos",
    },
    plan: {
      monthly: "Buwanan",
      yearly: "Taunan",
    },
  },
  deleteWarning:
    "May Plus subscription ka pa na naniningil. Hindi ito nakakansela kapag binura mo ang account mo: i-cancel muna ito sa billing portal. Nasa payment provider namin ang mga record ng bayad.",
  deleteNote:
    "Mabubura ang record ng Plus subscription mo kasama ng account. Ang mga record ng bayad ay nasa payment provider namin, hindi sa Dota Den.",
  admin: {
    title: "Mga Plus subscription",
    off: "Hindi naka-configure ang Plus sa server na ito.",
    disabled:
      "Naka-configure pero naka-off (hindi true ang PLUS_ENABLED): libre ang turing sa lahat.",
    entitled: "Mga player na may Plus",
    unlinked: "Hindi naka-link",
    unlinkedDetail: "Bayad pero hindi nakatali sa user",
    none: "Wala pang subscription.",
    caption: "Mga subscription ayon sa status",
    status: "Status",
    count: "Subscription",
  },
  terms: {
    title: "Mga tuntunin ng paggamit",
    kicker: "Legal",
    updated: "Huling na-update {date}",
    sections: {
      about: {
        title: "Tungkol sa Dota Den",
        body: "Ang Dota Den ay hindi opisyal na proyekto ng mga fan para sa mga Dota 2 player. Hindi ito kaugnay o inendorso ng Valve Corporation. Ang Dota 2 ay rehistradong trademark ng Valve Corporation.",
      },
      account: {
        title: "Ang account mo",
        body: "Nagsa-sign in ka gamit ang Steam. Ingatan ang Steam account mo: responsibilidad mo ang nangyayari sa account mo. Puwede naming i-suspend ang account na umaabuso sa serbisyo, halimbawa ang pag-atake o pag-scrape dito.",
      },
      data: {
        title: "Data ng mga laro",
        body: "Galing ang data ng mga laro sa mga pampublikong source gaya ng OpenDota at Valve. Ipinapakita namin ito kung paano namin natanggap at hindi namin maipapangako na kumpleto o tama ito. Walang anuman sa Dota Den ang naggagarantiya ng resulta sa mga laro mo.",
      },
      free: {
        title: "Libre at Plus",
        body: "Libre ang pangunahing bahagi ng Dota Den. Ang Plus ay opsyonal na subscription na may dagdag; hindi magiging bayad ang mga libreng feature dahil lang may Plus.",
      },
      payments: {
        title: "Bayad",
        body: "Ang Lemon Squeezy, bilang merchant of record, ang nagbebenta ng Plus. Sila ang nagpo-proseso ng bayad, naniningil ng sales tax o VAT at nagbibigay ng resibo, at ang kanilang buyer terms ang sinusunod sa pagbili.",
      },
      billing: {
        title: "Renewal at pag-cancel",
        body: "Nagre-renew ang Plus kada buwan o taon hanggang mag-cancel ka. Puwedeng mag-cancel kahit kailan sa billing portal; may Plus ka pa hanggang matapos ang period na binayaran mo.",
      },
      changes: {
        title: "Mga pagbabago",
        body: "Puwedeng magbago ang mga feature sa paglipas ng panahon. Kung may aalisin kami sa Plus, sasabihin namin nang maaga at puwede kang mag-cancel. Ia-update namin ang mga tuntuning ito kapag nagbago at ipapakita ang petsa sa itaas.",
      },
      warranty: {
        title: "Walang warranty",
        body: "Ibinibigay ang Dota Den nang ganito, walang warranty, hangga't pinapayagan ng batas. Walang anuman sa mga tuntuning ito ang naglilimita sa mga karapatan mo sa ilalim ng consumer law kung saan ka nakatira.",
      },
    },
  },
  refunds: {
    title: "Patakaran sa refund",
    kicker: "Legal",
    updated: "Huling na-update {date}",
    sections: {
      who: {
        title: "Sino ang humahawak ng refund",
        body: "Ibinebenta ang Plus sa pamamagitan ng Lemon Squeezy, ang aming merchant of record. Sila ang nagbibigay ng refund, ayon sa kanilang refund policy at sa consumer law kung saan ka nakatira.",
      },
      cancel: {
        title: "Pag-cancel",
        body: "Pinapahinto ng pag-cancel ang mga susunod na renewal. May Plus ka pa hanggang matapos ang period na nabayaran mo na; hindi ito awtomatikong nire-refund.",
      },
      request: {
        title: "Paghingi ng refund",
        body: "Kung may nangyaring mali (halimbawa, nasingil ka nang dalawang beses, o hindi gumana ang Plus para sa iyo), humingi sa loob ng 14 na araw mula sa singil sa billing portal o sa pag-reply sa resibo mo mula sa Lemon Squeezy.",
      },
      after: {
        title: "Pagkatapos ng refund",
        body: "Kapag buong na-refund ang isang bayad, puwedeng matapos agad ang Plus. Hindi apektado ang data mo sa Dota Den.",
      },
      rights: {
        title: "Ang mga karapatan mo",
        body: "Walang anuman sa patakarang ito ang naglilimita sa mga karapatan mo sa ilalim ng consumer law kung saan ka nakatira.",
      },
    },
  },
};
