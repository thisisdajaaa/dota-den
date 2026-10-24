import type { MessageTree } from "../../translate";
import type { home as en } from "../en/home";

export const home: MessageTree<typeof en> = {
  authErrors: {
    state_mismatch:
      "Nag-expire ang sign-in session mo o sinimulan ito sa ibang tab. Pakisubukan ulit.",
    provider_unavailable: "Hindi sumagot ang Steam. Subukan ulit maya-maya.",
    fallback: "Hindi namin ma-verify ang Steam sign-in mo. Pakisubukan ulit.",
  },
  alerts: {
    deletedTitle: "Na-delete na ang account mo",
    deletedBody:
      "Natanggal na lahat ng itinago ng Dota Den tungkol sa iyo. Salamat sa pagsubok mo.",
    signedOutTitle: "Naka-sign out ka na sa Dota Den",
    signedOutBefore:
      "Pinapanatili ka ng Steam na naka-sign in sa sarili nitong site, kaya kapag nag-sign in ka ulit dito, parehong Steam account ang gagamitin. Para magpalit ng account, mag-sign out muna sa Steam: ",
    signedOutLink: "buksan ang Steam Community",
    signedOutMiddle: ", i-click ang pangalan ng account mo sa kanang itaas at piliin ang ",
    signedOutSteamButton: "Sign out",
    signedOutAfter: ". Tapos bumalik dito at mag-sign in gamit ang ibang account.",
    signInRequiredTitle: "Kailangan mong mag-sign in",
    signInRequiredBody: "Mag-sign in gamit ang Steam para makita ang page na iyon.",
    signInFailedTitle: "Hindi nakapag-sign in",
  },
  hero: {
    kicker: "Hindi opisyal na kasama sa Dota 2",
    titleBefore: "Umakyat nang ",
    titleHighlight: "malinaw",
    titleAfter: ", hindi nanghuhula.",
    body: "Tingnan kung paano ka talaga maglaro nang solo kumpara sa stack mo, ano ang binago ng bawat patch sa mga hero mo, at mag-practice ng draft bago ang larong mahalaga.",
    signIn: "Mag-sign in gamit ang Steam",
    privacy: "Hindi namin nakikita ang password mo. Private ang data mo bilang default.",
    privacyLink: "Paano namin hinahawakan ang data mo",
    lookupLabel: "O hanapin ang kahit sinong player, kahit hindi naka-sign in",
    example: "Tingnan ang halimbawang profile",
    exampleWho: "Yatoro, isang pro carry",
  },
  patch: {
    aria: "Pinakabagong patch {version}: basahin ang notes",
    kicker: "Pinakabagong patch",
    changed: "{heroes} at {items} ang binago",
    heroesAria: "Ilan sa mga hero na binago",
    read: "Basahin ang patch notes",
    topChanges: "Mga hero na pinakamaraming binago",
    noHeroChanges: "Walang pagbabago sa mga hero sa patch na ito.",
    more: { one: "+1 pang linya", other: "+{n} pang linya" },
    metaCta: "Tingnan kung ano ang malakas ngayon",
  },
  preview: {
    label: "Preview ng Meta page gamit ang data ngayong araw",
    address: "dota-den.com/meta",
    kicker: "Meta",
    title: "Ano ang malakas ngayon",
    live: "Totoong data",
    source: "High-rank na laro sa OpenDota · na-update {ago}",
    sourcePositions: "Larong Ancient–Immortal sa STRATZ, {range} · na-update {ago}",
    open: "Buksan ang Meta",
    unavailable:
      "Hindi available ang hero stats ngayon. Lalabas ito sa Meta page kapag sumagot na ang OpenDota.",
    loading: "Nilo-load ang meta ngayong araw",
  },
  features: {
    kicker: "Ano ang makukuha mo",
    title: "Iisang lugar para sa Dota mo sa pagitan ng mga laro",
    party: {
      title: "Solo vs party, tapat",
      body: "Hati ang mga match mo sa solo, party at unknown, kasama kung saan galing ang bawat label. Hindi kailanman binibilang na solo ang kulang na data.",
      cta: "Mag-sign in para makita ang sa iyo",
    },
    draft: {
      title: "Draft practice",
      body: "Pick at ban drills at challenges na parang Captain's Mode, mag-isa o sa isang room kasama ang mga kaibigan. May dahilan, walang pekeng win odds.",
      cta: "Magsimula ng draft",
    },
    guides: {
      title: "Mga hero guide",
      body: "Ano ang binibili ng mga pro sa bawat hero at ano ang itsura ng magandang laro, galing sa totoong pro matches.",
      cta: "Tingnan ang mga guide",
    },
    live: {
      title: "Manood ng Dota nang live",
      body: "Mga live na Dota 2 stream na mapapanood mo rito kasama ang chat, ang mga streamer na fina-follow mo, at ang mga pro at top public game na nangyayari ngayon.",
      cta: "Tingnan ang live",
    },
  },
};
