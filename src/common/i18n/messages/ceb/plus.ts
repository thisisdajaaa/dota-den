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
        where: "Matches → ablihi ang usa sa imong mga duwa → AI coach → “Write my review”.",
      },
      ask: {
        title: "Ask Den: {plus} ka pangutana matag adlaw",
        body: "Pangutana bahin sa imong mga duwa, heroes, builds ug patch, gitubag gikan sa imong kaugalingong data ug sa amoa ({free} matag adlaw nga libre).",
        where:
          "Ang bulawan nga chat button sa tuo nga ubos sa bisan unsang page, o Ask Den sa menu. Pangutan-a bisan unsa bahin sa imong mga duwa, heroes o meta.",
      },
      compare: {
        title: "Unsaon ka ikumpara, sa matag hero",
        body: "Imong last hits, kills + assists ug deaths sa matag hero batok sa mga player nga parehas nimo og rank (o mas taas), sa parehas nga gitas-on sa duwa, uban ang imong pinakadakong kulang (libre: imong labing kanunay nga hero).",
        where:
          "Heroes → How you compare. Pili og hero nga imong gidula aron makita ang imong pinakadakong kulang.",
      },
      coaching: {
        title: "Mas paspas nga hero coaching",
        body: "Item timings ug lane results para sa tibuok nimong recent history sa matag hero: hangtod 100 sa imong mga parsed nga duwa ang masusi matag adlaw (libre: 10 matag adlaw).",
        where:
          "Heroes → ablihi ang usa sa imong mga hero → ang mga Coaching section (item timings ug lanes).",
      },
      buildCheck: {
        title: "Build check batok sa high-rank",
        body: "Sa matag hero page, imong item timings batok sa mga Legend–Immortal player sa imong posisyon sa miaging semana, uban ang usa ka sulayan (libre: imong kaugalingong timings).",
        where: "Heroes → ablihi ang usa sa imong mga hero → Build check vs high-rank.",
      },
      splits: {
        title: "Imong splits",
        body: "Ang tibuok nimong history sumala sa patch, posisyon, oras sa adlaw, gitas-on sa dula, resulta sa lane ug lane partner, matag usa batok sa imong average (libre: imong heroes, lanes ug matchups).",
        where: "Heroes → Your splits.",
      },
      postMortem: {
        title: "Post-mortem sa draft",
        body: "Sa mga match page, giunsa ang draft: mga lane sa 10 minutos itandi sa gipaabot sa draft, asa nakuha ang gold lead, ug ang mga counter nga nagustohan niini (libre: ang basa sa draft).",
        where:
          "Matches → ablihi ang usa ka ranked nga duwa → ang Draft post-mortem, ubos sa draft.",
      },
      read: {
        title: "AI read sa imong battle report",
        body: "Pagpili og bisan unsang panahon sa imong battle report ug makakuha og pipila ka obserbasyon ug usa ka angay tutokan, gisulat gikan lang sa mga numero sa maong page (nakalista ang mga numero nga gigamit).",
        where: "Battle report → pili og panahon → “What this period says” → “Write my read”.",
      },
      pick: {
        title: "Pilii para nako: imong top five",
        body: "Sa tinuod nga ranked draft, idugang ang mga pick sa kaaway ug tan-awa ang imong lima ka labing maayong hero batok kanila, uban ang imong record ug matag matchup (libre: ang labing maayo).",
        where:
          "Draft → Pick for me. Samtang naa ka sa tinuod nga ranked draft, ibutang ang picks sa kontra samtang mag-lock sila.",
      },
      session: {
        title: "Kauban sa session",
        body: "Samtang nagdula ka, adunay notification human sa matag dula: ang resulta, ang imong record karong session ug, kung ipakita sa imong kaugalingong history nga mas kanunay kang mapildi human sa sunod-sunod nga pildi, pahinumdom nga mopahulay usa.",
        where:
          "Account → Notifications: i-on ang notifications, dayon ipabilin nga naka-on ang “Live session updates”. Molihok samtang gipakita sa Steam nga naa ka sa Dota.",
      },
      sync: {
        title: "Priority sync",
        body: "Mas paspas ma-import ang taas nga match history: mas mubo nga paghulat ug mas dagkong batch, ug ipa-parse sa OpenDota ang imong pinakabag-o nga wala pa na-parse nga duwa (hangtod 3 kada sync). Usa ra gihapon ang OpenDota budget sa tanan, mao nga dili mohinay ang mga libreng player.",
        where: "Wala kay buhaton: awtomatiko kini inig sync sa imong mga duwa sa Overview.",
      },
      alerts: {
        title: "Alerto kung mag-live",
        body: "Notification sulod sa pipila ka minuto kung mosugod og stream ang streamer nga imong gi-follow sa /live. Kausa matag stream, ug pwede nimo kining i-off.",
        where:
          "Live → i-follow ang usa ka channel, ug i-on ang notifications sa Account → Notifications.",
      },
      badge: {
        title: "Supporter badge",
        body: "Gamay nga Plus badge tupad sa imong ngalan sa app ug sa leaderboards.",
        where: "Awtomatiko: tupad sa imong ngalan sa menu ug sa leaderboards.",
      },
      limits: {
        title: "Mas daghang lugar",
        body: "Mag-track hangtod {players} ka player, mag-follow og {streamers} ka channel ug mosulod sa {groups} ka grupo (doble sa libreng limit).",
        where:
          "Players → pag-track og players; Live → pag-follow og channels; Groups → paghimo o pag-apil.",
      },
      thanks: {
        title: "Magpabilin nga independent",
        body: "Naay gasto matag bulan ang server, data ug AI. Ang Plus ang mobayad niini, nga walay ads.",
        where: "Wala kay buhaton. Salamat!",
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
      providerPolar:
        "Ang Polar (polar.sh), isip merchant of record, ang modumala sa bayad. Ang Polar ang modawat sa bayad, maningil og tax ug mopadala sa resibo. Dili makita sa Dota Den ang imong card.",
      currencyPolar:
        "Naa sa Philippine pesos ang mga presyo. Ipakita sa checkout ang sales tax o VAT nga singilon diin ka nagpuyo sa dili pa ka mobayad.",
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
    trial: {
      title: "Sulayi ang Plus nga libre sulod sa 7 ka adlaw",
      body: "Dili kinahanglan ug card. Walay singil, ug kusa kining mahuman human sa 7 ka adlaw. Usa ka trial matag Steam account.",
      start: "Sugdi ang libre nga trial",
      signIn: "Mag-sign in aron sugdan ang libre nga trial",
      activeTitle: "Naka-on ang imong libre nga trial",
      activeBody:
        "Naa kay Plus hangtod {date}. Walay singil ug kusa kining mahuman. Mag-subscribe sa ubos aron magpadayon ang Plus human niana.",
      error: {
        used: "Ang imong account naka-Plus na o nakalibre nga trial na.",
        unavailable: "Dili available ang libre nga trial karon.",
        tooMany: "Daghan kaayong sulay. Paghulat ug usa ka minuto ug sulayi pag-usab.",
        signIn: "Mag-sign in pag-usab aron sugdan ang trial.",
        network: "Dili maabot ang Dota Den. Susiha ang imong koneksyon ug sulayi pag-usab.",
        down: "Naay sayop. Sulayi pag-usab unya.",
      },
    },
    invite: {
      title: "Imbitara ang higala: tag-usa mo ka semana sa Plus",
      body: "Ipadala ang imong link sa higala nga bag-o sa Dota Den. Kung ma-import na ang 10 sa iyang mga dula, naa mo duha og 7 ka adlaw sa Plus. Walay card, walay singil.",
      cta: "Kuhaa ang imong invite link",
      signIn: "Pag-sign in aron makuha ang imong invite link",
    },
    checkoutError: {
      network: "Dili maabot ang Dota Den. Susiha ang imong koneksyon ug sulayi pag-usab.",
      hasPlus:
        "Naa na kay Plus, o subscription nga naningil pa. Dumalaha kini sa imong account page.",
      unavailable: "Dili pa mapalit ang Plus diri karon.",
      tooMany: "Sobra ka daghang sulay. Paghulat og usa ka minuto ug sulayi pag-usab.",
      signIn: "Nahuman ang imong session. Pag-sign in pag-usab aron makakuha og Plus.",
      down: "Dili available ang checkout karon. Walay nasingil; sulayi pag-usab human sa pipila ka minuto.",
    },
  },
  invite: {
    title: "Imbitara ang higala",
    lead: "Ipadala ang imong link sa higala nga wala pa naggamit sa Dota Den. Kung mag-sign in siya gamit ang Steam ug ma-import na ang iyang mga dula, tag-usa mo ka semana sa Plus.",
    linkLabel: "Imong invite link",
    copy: "Kopyaha ang link",
    copied: "Nakopya na",
    share: "I-share",
    shareText:
      "I-track nato atong mga dula sa Dota sa Dota Den. Pag-sign in gamit kining link ug pareho ta nga makakuha og libre nga usa ka semana sa Plus:",
    joined: "Mga higala nga ni-apil",
    waiting: "Naghulat sa ilang mga dula",
    earned: "Mga semana nga imong nakuha",
    earnedOf: "{earned} sa {max}",
    rulesTitle: "Unsaon kini paglihok",
    rules: {
      link: "Ablihan sa imong higala ang imong link ug mag-sign in gamit ang Steam sulod sa 7 ka adlaw sukad una niyang gigamit ang Dota Den.",
      games:
        "Kung ma-import na ang 10 sa iyang mga dula, naa mo duha og 7 ka adlaw sa Plus. Kasagaran pipila ra ka minuto human siya mag-sign in.",
      free: "Walay singil ug dili kini mo-renew. Kung naa pa kay libre nga Plus nga nagdagan, magsugod ang bag-ong semana human niini.",
      paid: "Kung nagbayad ka sa Plus, dungan modagan ang imong semana ug ang imong subscription. Dili mausab ang imong bayronon.",
      max: "Hangtod {max} ka semana ang imong makuha. Kanunay makuha sa imong mga higala ang ila.",
      once: "Usa ra ka imbitasyon matag Steam account, ug sa wala pa kini makabaton og Plus subscription.",
    },
    unavailable: "Sirado karon ang mga imbitasyon. Mobalik kini kung mapalit na usab ang Plus.",
    maxed:
      "Nakuha na nimo ang tanang {max} ka semana. Makuha gihapon sa mga higala nga imong imbitaron ang ila.",
    mine: {
      pending:
        "Gigamit nimo ang imbitasyon sa imong higala. Magsugod ang imong semana kung ma-import na ang 10 sa imong mga dula: ablihi ang imong dashboard aron ma-import kini.",
      rewarded:
        "Ni-apil ka pinaagi sa imbitasyon sa imong higala ug nakuha nimo ang imong usa ka semana sa Plus.",
      expired:
        "Na-expire ang imbitasyon nga imong gigamit: wala mogawas ang imong mga dula sulod sa 30 ka adlaw.",
    },
  },
  referral: {
    title: "Giimbitar ka sa imong higala sa Dota Den",
    metaDescription:
      "Pag-sign in gamit ang Steam pinaagi niining imbitasyon: kung ma-import na ang imong mga dula, tag-usa mo sa imong higala ka semana sa Dota Den Plus.",
    lead: "Libre nga gi-track sa Dota Den ang imong mga dula sa Dota 2, imong MMR ug imong mga hero. Pag-sign in gamit ang Steam pinaagi niining imbitasyon ug tag-usa mo sa imong higala ka semana sa Plus kung ma-import na ang imong mga dula.",
    fine: "Dili kinahanglan og card. Walay singil, ug kusa nga mahuman ang semana.",
    signIn: "Pag-sign in gamit ang Steam",
    claim: "I-claim ang imong usa ka semana sa Plus",
    claiming: "Gi-claim…",
    check: "Tan-awa pag-usab",
    rewarded:
      "Human na: pareho na mo nga naay usa ka semana sa Plus. Walay singil; kusa kining mahuman.",
    waiting:
      "Na-claim na. Magsugod ang imong semana kung ma-import na ang 10 sa imong mga dula. Ablihi ang imong dashboard aron ma-import kini; kasagaran pipila ra ka minuto.",
    expired: "Na-expire kining imbitasyon: wala mogawas ang imong mga dula sulod sa 30 ka adlaw.",
    own: "Kini imong kaugalingon nga invite link. Ipadala kini sa higala.",
    notFoundTitle: "Dili molihok kining invite link",
    notFoundBody:
      "Pangutan-a pag-usab ang link sa imong higala. Libre gihapon gamiton ang Dota Den.",
    unavailable: "Sirado karon ang mga imbitasyon. Libre gihapon gamiton ang Dota Den.",
    toDashboard: "Adto sa imong dashboard",
    seePlus: "Tan-awa ang idugang sa Plus",
    getYours: "Kuhaa ang imong kaugalingon nga invite link",
    error: {
      own_code: "Kini imong kaugalingon nga invite link. Ipadala kini sa higala.",
      not_new:
        "Para sa mga bag-ong player sa Dota Den ang mga imbitasyon. Pwede gihapon nimo sulayan og libre ang Plus sulod sa 7 ka adlaw sa Plus page.",
      already_referred: "Nakagamit na og imbitasyon kining Steam account.",
      had_plus: "Para sa mga wala pa makabaton og Plus subscription ang mga imbitasyon.",
      unavailable: "Sirado karon ang mga imbitasyon.",
      unknown_code: "Dili molihok kining invite link.",
      tooMany: "Daghan kaayo nga pagsulay. Paghulat og usa ka minuto ug sulayi pag-usab.",
      signIn: "Pag-sign in pag-usab aron ma-claim ang imbitasyon.",
      network: "Dili maabot ang Dota Den. Susiha ang imong koneksyon ug sulayi pag-usab.",
      down: "Naay sayop. Sulayi pag-usab unya.",
    },
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
    freeTrial: "Libre nga trial: naay Plus hangtod {date}. Walay singil; kusa kining mahuman.",
    referral: "Ganti sa pag-imbitar: naay Plus hangtod {date}. Walay singil; kusa kining mahuman.",
    invite: "Imbitara ang higala",
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
    trials: "Mga libre nga trial",
    trialsDetail: "{active} nagdagan · {started} nasugdan · {subscribed} nag-subscribe human",
    referrals: "Mga imbitasyon",
    referralsDetail: "{rewarded} nahatagan · {pending} naghulat og dula · {claimed} na-claim",
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
        polar:
          "Ang Polar (polar.sh), isip merchant of record, ang mobaligya sa Plus. Ang Polar ang mo-proseso sa bayad, maningil og sales tax o VAT ug mohatag og resibo, ug ang buyer terms sa Polar ang sundon sa pagpalit.",
      },
      billing: {
        title: "Renewal ug pag-cancel",
        body: "Mo-renew ang Plus matag bulan o tuig hangtod mag-cancel ka. Pwede mag-cancel bisan kanus-a sa billing portal; naa gihapon kay Plus hangtod matapos ang period nga imong gibayran. Ang bag-ong mga player makasulay sa Plus nga libre sulod sa 7 ka adlaw, kausa matag Steam account: dili kinahanglan ug card, walay singil ug kusa kining mahuman.",
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
        polar:
          "Gibaligya ang Plus pinaagi sa Polar (polar.sh), isip merchant of record. Ang Polar ang mobalik sa kwarta: kami ang modesisyon sa mga hangyo nga refund sumala niini nga policy, ug mahimo usab nga mo-refund ang Polar sa kaugalingon niini sulod sa 60 ka adlaw gikan sa pagpalit, pananglitan aron malikayan ang chargeback. Sundon usab ang consumer law diin ka nagpuyo.",
      },
      cancel: {
        title: "Pag-cancel",
        body: "Ang pag-cancel mohunong sa mga sunod nga renewal. Naa gihapon kay Plus hangtod matapos ang period nga nabayran na nimo; dili kini awtomatikong i-refund.",
      },
      request: {
        title: "Pagpangayo og refund",
        body: "Kung naay sayop nga nahitabo (pananglitan, kaduha ka nasingil, o wala molihok ang Plus para nimo), pangayo sulod sa 14 ka adlaw gikan sa singil pinaagi sa billing portal o sa pag-reply sa resibo sa imong bayad.",
        polar:
          "Kung naay sayop (pananglitan, kaduha ka nasingil, o wala molihok ang Plus para nimo), pangayo sulod sa 14 ka adlaw gikan sa singil gamit ang contact sa ubos. Naa sa customer portal sa Polar ang imong mga resibo ug subscription, nga naka-link sa {account}.",
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
