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
    staffTitle: "May Plus ka",
    staffBody:
      "Admin ka, kaya bukas para sa iyo ang lahat ng Plus feature kahit walang subscription.",
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
        body: "Coach review ng kahit anong na-parse mong match, kahit ilang beses (libre: isang bagong review kada linggo). Mula lang sa mga numero ng match na iyon ito isinusulat, at puwede itong magkamali. Awtomatiko ring nirerebyu ang pinakabago mong ranked game pagkatapos ng bawat sync, at may notification kapag handa na ang review.",
        where: "Matches → buksan ang isa sa mga laro mo → AI coach → “Write my review”.",
      },
      ask: {
        title: "Ask Den: {plus} tanong kada araw",
        body: "Magtanong tungkol sa mga laro mo, heroes, builds at patch, sinasagot mula sa sarili mong data at sa amin ({free} kada araw nang libre).",
        where:
          "Ang gintong chat button sa kanang ibaba ng kahit anong page, o Ask Den sa menu. Itanong ang kahit ano tungkol sa laro mo, heroes o meta.",
      },
      compare: {
        title: "Paano ka ikumpara, sa bawat hero",
        body: "Ang last hits, kills + assists at deaths mo sa bawat hero laban sa mga player na kapareho mo ng rank (o mas mataas), sa parehong haba ng laro, kasama ang pinakamalaking kulang mo (libre: ang pinakamadalas mong hero).",
        where:
          "Heroes → How you compare. Pumili ng hero na nilalaro mo para makita ang pinakamalaking kulang mo.",
      },
      coaching: {
        title: "Mas mabilis na hero coaching",
        body: "Item timings at lane results para sa buong recent history mo sa bawat hero: hanggang 100 sa mga parsed game mo ang nasusuri bawat araw (libre: 10 bawat araw).",
        where:
          "Heroes → buksan ang isa sa mga hero mo → ang mga Coaching section (item timings at lanes).",
      },
      buildCheck: {
        title: "Build check laban sa high-rank",
        body: "Sa bawat hero page, ang item timings mo laban sa mga Legend–Immortal player sa posisyon mo noong nakaraang linggo, kasama ang isang susubukan (libre: ang sarili mong timings).",
        where: "Heroes → buksan ang isa sa mga hero mo → Build check vs high-rank.",
      },
      splits: {
        title: "Iyong splits",
        body: "Ang buong history mo ayon sa patch, posisyon, oras ng araw, haba ng laro, resulta ng lane at lane partner, bawat isa laban sa average mo (libre: heroes, lanes at matchups mo).",
        where: "Heroes → Your splits.",
      },
      postMortem: {
        title: "Post-mortem ng draft",
        body: "Sa mga match page, kung paano lumabas ang draft: mga lane sa 10 minuto kumpara sa inasahan ng draft, saan nakuha ang gold lead, at ang mga counter na nagustuhan nito (libre: ang basa sa draft).",
        where:
          "Matches → buksan ang isang ranked na laro → ang Draft post-mortem, sa ilalim ng draft.",
      },
      read: {
        title: "AI read ng battle report mo",
        body: "Pumili ng kahit anong panahon sa battle report mo at makakuha ng ilang obserbasyon at isang dapat pagtuunan, isinulat mula lang sa mga numero ng page na iyon (nakalista ang mga ginamit na numero).",
        where: "Battle report → pumili ng panahon → “What this period says” → “Write my read”.",
      },
      pick: {
        title: "Pumili para sa akin: ang top five mo",
        body: "Sa totoong ranked draft, idagdag ang mga pick ng kalaban at makita ang limang pinakamagandang hero mo laban sa kanila, kasama ang record mo at bawat matchup (libre: ang pinakamaganda).",
        where:
          "Draft → Pick for me. Habang nasa totoong ranked draft ka, ilagay ang picks ng kalaban habang nagla-lock sila.",
      },
      session: {
        title: "Kasama sa session",
        body: "Habang naglalaro ka, may notification pagkatapos ng bawat laro: ang resulta, ang record mo ngayong session at, kapag ipinapakita ng sarili mong history na mas madalas kang matalo pagkatapos ng sunod-sunod na talo, paalala na magpahinga muna.",
        where:
          "Account → Notifications: i-on ang notifications, tapos panatilihing naka-on ang “Live session updates”. Gumagana habang ipinapakita ng Steam na nasa Dota ka.",
      },
      sync: {
        title: "Priority sync",
        body: "Mas mabilis ma-import ang mahabang match history: mas maikling paghihintay at mas malalaking batch, at ipinapa-parse sa OpenDota ang pinakabago mong hindi pa na-parse na laro (hanggang 3 kada sync). Iisang OpenDota budget pa rin ang gamit ng lahat, kaya hindi bumabagal ang mga libreng player.",
        where: "Wala kang gagawin: awtomatiko ito kapag nagsi-sync ang mga laro mo sa Overview.",
      },
      alerts: {
        title: "Alerto kapag nag-live",
        body: "Notification sa loob ng ilang minuto kapag nag-stream ang streamer na fina-follow mo sa /live. Isang beses kada stream, at puwede mo itong i-off.",
        where:
          "Live → i-follow ang isang channel, at i-on ang notifications sa Account → Notifications.",
      },
      badge: {
        title: "Supporter badge",
        body: "Maliit na Plus badge sa tabi ng pangalan mo sa app at sa leaderboards.",
        where: "Awtomatiko: katabi ng pangalan mo sa menu at sa leaderboards.",
      },
      limits: {
        title: "Mas maraming puwang",
        body: "Mag-track ng hanggang {players} player, mag-follow ng {streamers} channel at sumali sa {groups} grupo (doble ng libreng limit).",
        where:
          "Players → mag-track ng players; Live → mag-follow ng channels; Groups → gumawa o sumali.",
      },
      thanks: {
        title: "Manatiling independent",
        body: "May gastos buwan-buwan ang server, data at AI. Ang Plus ang nagbabayad dito, nang walang ads.",
        where: "Wala kang gagawin. Salamat!",
      },
    },
    monthly: "Buwanan",
    yearly: "Taunan",
    perMonth: "kada buwan",
    plansTitle: "Mga plan",
    opensSoon: "Bubuksan na sa lalong madaling panahon",
    perYear: "kada taon",
    yearlySaving: "Libre ang 2 buwan kumpara sa buwanang bayad",
    subscribe: "Kumuha ng Plus",
    subscribeMonthly: "Kumuha ng Plus buwanan",
    subscribeYearly: "Kumuha ng Plus taunan",
    signIn: "Mag-sign in gamit ang Steam para makakuha ng Plus",
    youHavePlus: "May Plus ka na. Salamat!",
    stillBilling:
      "May Plus subscription ka pa rin: may bayad na hindi pumasok, o naka-pause ito. I-update ang card mo o ituloy ito mula sa account page mo sa halip na magsimula ng bago, para hindi ka masingil nang dalawang beses.",
    manage: "I-manage ang plan mo",
    notes: {
      currency:
        "Nasa Philippine peso ang mga presyo. Puwedeng ipakita ng checkout ito sa lokal mong pera, kasama ang sales tax o VAT kung mayroon.",
      provider:
        "Ang payment provider namin, bilang merchant of record, ang humahawak ng bayad. Sila ang tumatanggap ng bayad, naniningil ng tax at nagpapadala ng resibo. Hindi nakikita ng Dota Den ang card mo.",
      providerPolar:
        "Ang Polar (polar.sh), bilang merchant of record, ang humahawak ng bayad. Ang Polar ang tumatanggap ng bayad, naniningil ng tax at nagpapadala ng resibo. Hindi nakikita ng Dota Den ang card mo.",
      currencyPolar:
        "Nasa Philippine pesos ang mga presyo. Ipinapakita ng checkout ang sales tax o VAT na sinisingil kung saan ka nakatira bago ka magbayad.",
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
    legal: "Basahin ang {terms}, ang {refunds} at ang {privacy}.",
    termsLink: "mga tuntunin",
    refundsLink: "patakaran sa refund",
    privacyLink: "patakaran sa privacy",
    trial: {
      title: "Subukan ang Plus nang libre sa loob ng 7 araw",
      body: "Hindi kailangan ng card. Walang sisingilin, at kusa itong matatapos pagkalipas ng 7 araw. Isang trial bawat Steam account.",
      start: "Simulan ang libreng trial",
      signIn: "Mag-sign in para simulan ang libreng trial",
      activeTitle: "Naka-on ang libreng trial mo",
      activeBody:
        "May Plus ka hanggang {date}. Walang sisingilin at kusa itong matatapos. Mag-subscribe sa ibaba para tuloy ang Plus pagkatapos.",
      error: {
        used: "Nagkaroon na ng Plus o libreng trial ang account mo.",
        unavailable: "Hindi available ang libreng trial ngayon.",
        tooMany: "Masyadong maraming subok. Maghintay ng isang minuto at subukan ulit.",
        signIn: "Mag-sign in ulit para simulan ang trial.",
        network: "Hindi maabot ang Dota Den. Tingnan ang koneksyon mo at subukan ulit.",
        down: "May nagkamali. Subukan ulit mamaya.",
      },
    },
    invite: {
      title: "Mag-imbita ng kaibigan: tig-isang linggo kayo ng Plus",
      body: "Ipadala ang link mo sa kaibigang bago sa Dota Den. Kapag na-import na ang 10 sa mga laro niya, may 7 araw kayong dalawa ng Plus. Walang card, walang sisingilin.",
      cta: "Kunin ang invite link mo",
      signIn: "Mag-sign in para makuha ang invite link mo",
    },
    checkoutError: {
      network: "Hindi maabot ang Dota Den. Tingnan ang koneksyon mo at subukan ulit.",
      hasPlus:
        "May Plus ka na, o subscription na naniningil pa. Pamahalaan ito sa account page mo.",
      unavailable: "Hindi pa mabibili ang Plus dito ngayon.",
      tooMany: "Masyadong maraming subok. Maghintay ng isang minuto at subukan ulit.",
      signIn: "Natapos ang session mo. Mag-sign in ulit para makakuha ng Plus.",
      down: "Hindi available ang checkout ngayon. Walang nasingil; subukan ulit pagkalipas ng ilang minuto.",
    },
  },
  invite: {
    title: "Mag-imbita ng kaibigan",
    lead: "Ipadala ang link mo sa kaibigang hindi pa gumagamit ng Dota Den. Kapag nag-sign in siya gamit ang Steam at na-import na ang mga laro niya, tig-isang linggo kayo ng Plus.",
    linkLabel: "Ang invite link mo",
    copy: "Kopyahin ang link",
    copied: "Nakopya na",
    share: "I-share",
    shareText:
      "I-track natin ang mga laro natin sa Dota sa Dota Den. Mag-sign in gamit ang link na ito at pareho tayong may libreng isang linggo ng Plus:",
    joined: "Mga kaibigang sumali",
    waiting: "Naghihintay ng mga laro nila",
    earned: "Mga linggong nakuha mo",
    earnedOf: "{earned} sa {max}",
    rulesTitle: "Paano ito gumagana",
    rules: {
      link: "Bubuksan ng kaibigan mo ang link mo at magsa-sign in gamit ang Steam sa loob ng 7 araw mula noong una niyang ginamit ang Dota Den.",
      games:
        "Kapag na-import na ang 10 sa mga laro niya, may 7 araw kayong dalawa ng Plus. Karaniwang ilang minuto lang ito pagka-sign in niya.",
      free: "Walang sisingilin at hindi ito magre-renew. Kung may libreng Plus ka pang tumatakbo, magsisimula ang bagong linggo pagkatapos nito.",
      paid: "Kung nagbabayad ka ng Plus, sabay na tatakbo ang linggo mo at ang subscription mo. Hindi magbabago ang bill mo.",
      max: "Hanggang {max} linggo ang puwede mong makuha. Laging makukuha ng mga kaibigan mo ang sa kanila.",
      once: "Isang imbitasyon lang bawat Steam account, at bago pa ito nagkaroon ng Plus subscription.",
    },
    unavailable:
      "Sarado muna ang mga imbitasyon. Babalik ang mga ito kapag mabibili na ulit ang Plus.",
    maxed:
      "Nakuha mo na ang lahat ng {max} linggo. Makukuha pa rin ng mga kaibigang iimbitahan mo ang sa kanila.",
    mine: {
      pending:
        "Ginamit mo ang imbitasyon ng kaibigan mo. Magsisimula ang linggo mo kapag na-import na ang 10 sa mga laro mo: buksan ang dashboard mo para i-import ang mga ito.",
      rewarded:
        "Sumali ka gamit ang imbitasyon ng kaibigan mo at nakuha mo ang isang linggo mo ng Plus.",
      expired:
        "Nag-expire ang imbitasyong ginamit mo: hindi lumabas ang mga laro mo sa loob ng 30 araw.",
    },
  },
  referral: {
    title: "Inimbitahan ka ng kaibigan mo sa Dota Den",
    metaDescription:
      "Mag-sign in gamit ang Steam sa imbitasyong ito: kapag na-import na ang mga laro mo, tig-isang linggo kayo ng kaibigan mo ng Dota Den Plus.",
    lead: "Libreng tina-track ng Dota Den ang mga laro mo sa Dota 2, ang MMR mo at ang mga hero mo. Mag-sign in gamit ang Steam sa imbitasyong ito at tig-isang linggo kayo ng kaibigan mo ng Plus kapag na-import na ang mga laro mo.",
    fine: "Hindi kailangan ng card. Walang sisingilin, at kusang matatapos ang linggo.",
    signIn: "Mag-sign in gamit ang Steam",
    claim: "I-claim ang isang linggo mo ng Plus",
    claiming: "Kine-claim…",
    check: "Tingnan ulit",
    rewarded:
      "Tapos na: pareho na kayong may isang linggo ng Plus. Walang sisingilin; kusa itong matatapos.",
    waiting:
      "Na-claim na. Magsisimula ang linggo mo kapag na-import na ang 10 sa mga laro mo. Buksan ang dashboard mo para i-import ang mga ito; karaniwang ilang minuto lang.",
    expired: "Nag-expire ang imbitasyong ito: hindi lumabas ang mga laro mo sa loob ng 30 araw.",
    own: "Ito ang sarili mong invite link. Ipadala mo ito sa kaibigan.",
    notFoundTitle: "Hindi gumagana ang invite link na ito",
    notFoundBody: "Itanong ulit ang link sa kaibigan mo. Libre pa ring gamitin ang Dota Den.",
    unavailable: "Sarado muna ang mga imbitasyon. Libre pa ring gamitin ang Dota Den.",
    toDashboard: "Pumunta sa dashboard mo",
    seePlus: "Tingnan ang dagdag ng Plus",
    getYours: "Kunin ang sarili mong invite link",
    error: {
      own_code: "Ito ang sarili mong invite link. Ipadala mo ito sa kaibigan.",
      not_new:
        "Para sa mga bagong player ng Dota Den ang mga imbitasyon. Puwede mo pa ring subukan nang libre ang Plus nang 7 araw sa Plus page.",
      already_referred: "Nakagamit na ng imbitasyon ang Steam account na ito.",
      had_plus: "Para sa mga hindi pa nagkaroon ng Plus subscription ang mga imbitasyon.",
      unavailable: "Sarado muna ang mga imbitasyon.",
      unknown_code: "Hindi gumagana ang invite link na ito.",
      tooMany: "Masyadong maraming subok. Maghintay ng isang minuto at subukan ulit.",
      signIn: "Mag-sign in ulit para i-claim ang imbitasyon.",
      network: "Hindi maabot ang Dota Den. Tingnan ang koneksyon mo at subukan ulit.",
      down: "May nagkaproblema. Subukan ulit maya-maya.",
    },
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
    staff: "Libre ang Plus para sa iyo: admin ka.",
    cancelled: "Na-cancel na. May Plus ka pa hanggang {date}.",
    grace:
      "Pumalya ang huli mong bayad. I-update ang card mo bago mag-{date} para manatili ang Plus.",
    ended: "Natapos na ang Plus subscription mo.",
    paused: "Naka-pause ang Plus subscription mo.",
    disabled:
      "Naka-off muna ang mga Plus feature sa Dota Den ngayon. Hindi apektado ang subscription mo.",
    alertsOn: "Naka-on ang alerto kapag nag-live sa Notifications sa ibaba.",
    freeTrial: "Libreng trial: may Plus hanggang {date}. Walang sisingilin; kusa itong matatapos.",
    referral:
      "Premyo sa pag-imbita: may Plus hanggang {date}. Walang sisingilin; kusa itong matatapos.",
    invite: "Mag-imbita ng kaibigan",
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
    trials: "Mga libreng trial",
    trialsDetail:
      "{active} tumatakbo · {started} nasimulan · {subscribed} nag-subscribe pagkatapos",
    referrals: "Mga imbitasyon",
    referralsDetail: "{rewarded} nabigyan · {pending} naghihintay ng laro · {claimed} na-claim",
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
        body: "Ang Dota Den ay independiyenteng software na tumutulong sa mga Dota 2 player na suriin ang sarili nilang mga laro: match history, pagsubaybay ng rank, draft tools at AI coaching, na ginawa at pinapatakbo ng sarili nitong developer. Hindi ito kaugnay o inendorso ng Valve Corporation. Ang Dota 2 ay rehistradong trademark ng Valve Corporation.",
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
        body: "Ang payment provider namin, bilang merchant of record, ang nagbebenta ng Plus. Sila ang nagpo-proseso ng bayad, naniningil ng sales tax o VAT at nagbibigay ng resibo, at ang kanilang buyer terms ang sinusunod sa pagbili.",
        polar:
          "Ang Polar (polar.sh), bilang merchant of record, ang nagbebenta ng Plus. Ang Polar ang nagpo-proseso ng bayad, naniningil ng sales tax o VAT at nagbibigay ng resibo, at ang buyer terms ng Polar ang sinusunod sa pagbili.",
      },
      billing: {
        title: "Renewal at pag-cancel",
        body: "Nagre-renew ang Plus kada buwan o taon hanggang mag-cancel ka. Puwedeng mag-cancel kahit kailan sa billing portal; may Plus ka pa hanggang matapos ang period na binayaran mo. Puwedeng subukan ng mga bagong player ang Plus nang libre sa loob ng 7 araw, isang beses bawat Steam account: hindi kailangan ng card, walang sisingilin at kusa itong matatapos.",
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
        body: "Ibinebenta ang Plus sa pamamagitan ng payment provider namin, bilang merchant of record. Sila ang nagbibigay ng refund, ayon sa kanilang refund policy at sa consumer law kung saan ka nakatira.",
        polar:
          "Ibinebenta ang Plus sa pamamagitan ng Polar (polar.sh), bilang merchant of record. Ang Polar ang nagbabalik ng pera: kami ang nagpapasya sa mga hiling na refund ayon sa policy na ito, at puwede ring mag-refund ang Polar nang kusa sa loob ng 60 araw mula sa pagbili, halimbawa para maiwasan ang chargeback. Sinusunod din ang consumer law kung saan ka nakatira.",
      },
      cancel: {
        title: "Pag-cancel",
        body: "Pinapahinto ng pag-cancel ang mga susunod na renewal. May Plus ka pa hanggang matapos ang period na nabayaran mo na; hindi ito awtomatikong nire-refund.",
      },
      request: {
        title: "Paghingi ng refund",
        body: "Kung may nangyaring mali (halimbawa, nasingil ka nang dalawang beses, o hindi gumana ang Plus para sa iyo), humingi sa loob ng 14 na araw mula sa singil sa billing portal o sa pag-reply sa resibo ng bayad mo.",
        polar:
          "Kung may nagkamali (halimbawa, dalawang beses kang nasingil, o hindi gumana ang Plus para sa iyo), humiling sa loob ng 14 na araw mula sa singil gamit ang contact sa ibaba. Nasa customer portal ng Polar ang mga resibo at subscription mo, na naka-link sa {account}.",
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
