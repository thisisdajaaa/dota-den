import type { MessageTree } from "../../translate";
import type { plus as en } from "../en/plus";

/** DRAFT (legal): ang `terms` ug `refunds` kay draft pa nga i-review sa owner (tan-awa ang en/plus.ts). */
export const plus: MessageTree<typeof en> = {
  badge: {
    label: "Plus",
    title: "Supporter sa Dota Den Plus",
  },
  page: {
    title: "Dota Den Plus",
    kicker: "Suportahi ang Dota Den",
    lead: "Ang tanan nga libre karon magpabilin nga libre. Ang Plus kay paagi aron magpadayon ang Dota Den, nga naay gamay nga dugang para sa mga player nga motabang.",
    staffTitle: "Naa kay Plus",
    staffBody: "Admin ka, mao nga abli para nimo ang tanang Plus feature bisan walay subscription.",
    comingSoonTitle: "Hapit na ang Plus",
    comingSoonBody:
      "Giandam pa namo ang bayaranan. Wala pay gibaligya, ug walay bisan unsa nga imong gigamit karon nga ma-lock tungod niini.",
    pausedTitle: "Naka-pause ang mga bag-ong subscription",
    pausedBody:
      "Dili ka makasugod og Plus karon. Kung naka-subscribe na ka, pwede gihapon nimo kining i-manage o i-cancel sa imong account page.",
    freeTitle: "Libre para sa tanan, kanunay",
    free: {
      matches: "Match history, mga session, mga hero ug imong mga report",
      mmr: "MMR journal ug rank journey",
      draft: "Draft practice, AI captain, mga challenge ug room",
      community: "Mga grupo, together stats, tracked players ug leaderboards",
      live: "Mga live nga duwa, stream ug gi-follow nga streamer",
      notifications: "Mga notification para sa session, semana ug patch",
      coach:
        "AI match coach: usa ka bag-ong review sa imong kaugalingong na-parse nga duwa kada semana",
    },
    plusTitle: "Unsa ang idugang sa Plus",
    perks: {
      coach: {
        title: "Walay limit nga AI coach",
        body: "Coach review sa bisan unsang na-parse nimo nga duwa, bisan pila ka higayon (libre: usa ka bag-ong review kada semana). Gikan ra sa mga numero niadtong duwa kini isulat, ug mahimo kining masayop. Awtomatiko usab nga gi-review ang imong pinakabag-o nga ranked nga duwa human sa matag sync, ug adunay notification kung andam na ang review.",
      },
      compare: {
        title: "Unsaon ka ikumpara, sa matag hero",
        body: "Imong last hits, kills + assists ug deaths sa matag hero batok sa mga player nga parehas nimo og rank (o mas taas), sa parehas nga gitas-on sa duwa, uban ang imong pinakadakong kulang (libre: imong labing kanunay nga hero).",
      },
      read: {
        title: "AI read sa imong battle report",
        body: "Pagpili og bisan unsang panahon sa imong battle report ug makakuha og pipila ka obserbasyon ug usa ka angay tutokan, gisulat gikan lang sa mga numero sa maong page (nakalista ang mga numero nga gigamit).",
      },
      pick: {
        title: "Pilii para nako: imong top five",
        body: "Sa tinuod nga ranked draft, idugang ang mga pick sa kaaway ug tan-awa ang imong lima ka labing maayong hero batok kanila, uban ang imong record ug matag matchup (libre: ang labing maayo).",
      },
      session: {
        title: "Kauban sa session",
        body: "Samtang nagdula ka, adunay notification human sa matag dula: ang resulta, ang imong record karong session ug, kung ipakita sa imong kaugalingong history nga mas kanunay kang mapildi human sa sunod-sunod nga pildi, pahinumdom nga mopahulay usa.",
      },
      sync: {
        title: "Priority sync",
        body: "Mas paspas ma-import ang taas nga match history: mas mubo nga paghulat ug mas dagkong batch, ug ipa-parse sa OpenDota ang imong pinakabag-o nga wala pa na-parse nga duwa (hangtod 3 kada sync). Usa ra gihapon ang OpenDota budget sa tanan, mao nga dili mohinay ang mga libreng player.",
      },
      alerts: {
        title: "Alerto kung mag-live",
        body: "Notification sulod sa pipila ka minuto kung mosugod og stream ang streamer nga imong gi-follow sa /live. Kausa matag stream, ug pwede nimo kining i-off.",
      },
      badge: {
        title: "Supporter badge",
        body: "Gamay nga Plus badge tupad sa imong ngalan sa app ug sa leaderboards.",
      },
      limits: {
        title: "Mas daghang lugar",
        body: "Mag-track hangtod {players} ka player, mag-follow og {streamers} ka channel ug mosulod sa {groups} ka grupo (doble sa libreng limit).",
      },
      thanks: {
        title: "Magpabilin nga independent",
        body: "Naay gasto matag bulan ang server, data ug AI. Ang Plus ang mobayad niini, nga walay ads.",
      },
    },
    monthly: "Binulan",
    yearly: "Tinuig",
    perMonth: "matag bulan",
    plansTitle: "Mga plan",
    opensSoon: "Ablihan na sa dili madugay",
    perYear: "matag tuig",
    yearlySaving: "Libre ang 2 ka bulan kumpara sa binulan nga bayad",
    subscribe: "Pagkuha og Plus",
    subscribeMonthly: "Pagkuha og Plus binulan",
    subscribeYearly: "Pagkuha og Plus tinuig",
    signIn: "Pag-sign in gamit ang Steam aron makakuha og Plus",
    youHavePlus: "Naa na kay Plus. Salamat!",
    stillBilling:
      "Naa pa kay Plus subscription: adunay bayad nga wala molampos, o naka-pause kini. I-update ang imong card o ipadayon kini gikan sa imong account page imbes magsugod og bag-o, aron dili ka masingil kaduha.",
    manage: "I-manage ang imong plan",
    notes: {
      currency:
        "Naa sa Philippine peso ang mga presyo. Pwede kining ipakita sa checkout sa imong lokal nga kwarta, uban ang sales tax o VAT kung naa.",
      provider:
        "Ang among payment provider, isip merchant of record, ang modumala sa bayad. Sila ang modawat sa bayad, maningil og tax ug mopadala sa resibo. Dili makita sa Dota Den ang imong card.",
      cancel:
        "Pwede mag-cancel bisan kanus-a sa billing portal. Naa gihapon kay Plus hangtod matapos ang period nga imong gibayran.",
    },
    faqTitle: "Mga pangutana",
    faq: {
      freeQ: "Mahimo bang bayran ang bisan unsa nga libre karon?",
      freeA:
        "Dili. Modugang lang ang Plus. Kung naay libreng feature nga kinahanglan mausab, dili kini aron pugson ka nga mobayad.",
      cancelQ: "Unsa ang mahitabo kung mag-cancel ko?",
      cancelA:
        "Walay mausab hangtod matapos ang bulan o tuig nga imong gibayran. Human niana, mobalik sa libre ang imong account, ug magpabilin ang imong data.",
      failQ: "Unsa kung mapakyas ang bayad?",
      failA:
        "Naa gihapon kay Plus sulod sa 7 ka adlaw samtang sulayan pag-usab sa payment provider ang imong card. I-update ang imong card sa billing portal aron dili kini mawala.",
      limitsQ: "Unsa ang mahitabo sa akong dugang nga follow kung matapos ang Plus?",
      limitsA: "Walay mapapas. Dili ka lang makadugang hangtod mous-os ka sa libreng limit.",
    },
    legal: "Basaha ang {terms}, ang {refunds} ug ang {privacy}.",
    termsLink: "mga termino",
    refundsLink: "palisiya sa refund",
    privacyLink: "palisiya sa privacy",
  },
  card: {
    title: "Imong plan",
    free: "Libre",
    freeBody: "Naa ka sa libreng plan: ang tanang libreng feature magpabilin nga libre.",
    plusName: "Dota Den Plus",
    see: "Tan-awa ang idugang sa Plus",
    manage: "I-manage o i-cancel",
    manageHint: "Ablihan ang billing portal sa among payment provider.",
    renews: "Mo-renew sa {date}",
    trial: "Trial",
    staff: "Libre ang Plus para nimo: admin ka.",
    cancelled: "Na-cancel na. Naa gihapon kay Plus hangtod {date}.",
    grace:
      "Napakyas ang imong katapusang bayad. I-update ang imong card sa dili pa {date} aron magpabilin ang Plus.",
    ended: "Natapos na ang imong Plus subscription.",
    paused: "Naka-pause ang imong Plus subscription.",
    disabled:
      "Naka-off sa pagkakaron ang mga Plus feature sa Dota Den. Dili apektado ang imong subscription.",
    alertsOn: "Naka-on ang alerto kung mag-live sa Notifications sa ubos.",
    status: {
      on_trial: "Trial",
      active: "Aktibo",
      paused: "Naka-pause",
      past_due: "Napakyas ang bayad",
      unpaid: "Wala nabayri",
      cancelled: "Na-cancel",
      expired: "Natapos",
    },
    plan: {
      monthly: "Binulan",
      yearly: "Tinuig",
    },
  },
  deleteWarning:
    "Naa kay Plus subscription nga naningil pa. Dili kini ma-cancel kung papason nimo ang imong account: i-cancel una kini sa billing portal. Ang mga record sa bayad naa sa among payment provider.",
  deleteNote:
    "Mapapas ang record sa imong Plus subscription uban sa account. Ang mga record sa bayad gitipigan sa among payment provider, dili sa Dota Den.",
  admin: {
    title: "Mga Plus subscription",
    off: "Wala na-configure ang Plus niining server.",
    disabled: "Na-configure apan naka-off (dili true ang PLUS_ENABLED): libre ang tanan.",
    entitled: "Mga player nga naay Plus",
    unlinked: "Wala na-link",
    unlinkedDetail: "Bayad apan wala nahigot sa user",
    none: "Wala pay subscription.",
    caption: "Mga subscription sumala sa status",
    status: "Status",
    count: "Subscription",
  },
  terms: {
    title: "Mga termino sa paggamit",
    kicker: "Legal",
    updated: "Katapusang na-update {date}",
    sections: {
      about: {
        title: "Mahitungod sa Dota Den",
        body: "Ang Dota Den kay independiyenteng software nga motabang sa mga Dota 2 player sa pagsusi sa ilang kaugalingong mga duwa: match history, pagsubay sa rank, draft tools ug AI coaching, nga gihimo ug gipadagan sa kaugalingon niining developer. Dili kini konektado o gi-endorso sa Valve Corporation. Ang Dota 2 kay rehistradong trademark sa Valve Corporation.",
      },
      account: {
        title: "Imong account",
        body: "Mo-sign in ka gamit ang Steam. Bantayi ang imong Steam account: imong responsibilidad ang mahitabo sa imong account. Pwede namong i-suspend ang account nga moabuso sa serbisyo, pananglitan ang pag-atake o pag-scrape niini.",
      },
      data: {
        title: "Data sa mga duwa",
        body: "Ang data sa mga duwa gikan sa mga publikong source sama sa OpenDota ug Valve. Gipakita namo kini sumala sa among nadawat ug dili namo masaad nga kompleto o sakto kini. Walay bisan unsa sa Dota Den nga mogarantiya sa resulta sa imong mga duwa.",
      },
      free: {
        title: "Libre ug Plus",
        body: "Libre ang panguna nga bahin sa Dota Den. Ang Plus kay opsyonal nga subscription nga naay dugang; dili mahimong bayad ang mga libreng feature tungod lang kay naa ang Plus.",
      },
      payments: {
        title: "Bayad",
        body: "Ang among payment provider, isip merchant of record, ang mobaligya sa Plus. Sila ang mo-proseso sa bayad, maningil og sales tax o VAT ug mohatag og resibo, ug ang ilang buyer terms ang sundon sa pagpalit.",
      },
      billing: {
        title: "Renewal ug pag-cancel",
        body: "Mo-renew ang Plus matag bulan o tuig hangtod mag-cancel ka. Pwede mag-cancel bisan kanus-a sa billing portal; naa gihapon kay Plus hangtod matapos ang period nga imong gibayran.",
      },
      changes: {
        title: "Mga kausaban",
        body: "Pwedeng mausab ang mga feature sa paglabay sa panahon. Kung naay kuhaon namo sa Plus, isulti namo daan ug pwede ka mag-cancel. I-update namo kining mga termino kung mausab ug ipakita ang petsa sa ibabaw.",
      },
      warranty: {
        title: "Walay warranty",
        body: "Gihatag ang Dota Den sama niini, walay warranty, kutob sa gitugot sa balaod. Walay bisan unsa niining mga termino nga molimitar sa imong mga katungod ubos sa consumer law diin ka nagpuyo.",
      },
    },
  },
  refunds: {
    title: "Palisiya sa refund",
    kicker: "Legal",
    updated: "Katapusang na-update {date}",
    sections: {
      who: {
        title: "Kinsa ang modumala sa refund",
        body: "Gibaligya ang Plus pinaagi sa among payment provider, isip merchant of record. Sila ang mohatag og refund, sumala sa ilang refund policy ug sa consumer law diin ka nagpuyo.",
      },
      cancel: {
        title: "Pag-cancel",
        body: "Ang pag-cancel mohunong sa mga sunod nga renewal. Naa gihapon kay Plus hangtod matapos ang period nga nabayran na nimo; dili kini awtomatikong i-refund.",
      },
      request: {
        title: "Pagpangayo og refund",
        body: "Kung naay sayop nga nahitabo (pananglitan, kaduha ka nasingil, o wala molihok ang Plus para nimo), pangayo sulod sa 14 ka adlaw gikan sa singil pinaagi sa billing portal o sa pag-reply sa resibo sa imong bayad.",
      },
      after: {
        title: "Human sa refund",
        body: "Kung tibuok nga na-refund ang usa ka bayad, pwedeng matapos dayon ang Plus. Dili apektado ang imong data sa Dota Den.",
      },
      rights: {
        title: "Imong mga katungod",
        body: "Walay bisan unsa niining palisiya nga molimitar sa imong mga katungod ubos sa consumer law diin ka nagpuyo.",
      },
    },
  },
};
