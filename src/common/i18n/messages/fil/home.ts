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
  },
  patch: {
    aria: "Pinakabagong patch {version}: basahin ang notes",
    kicker: "Pinakabagong patch",
    changed: "{heroes} hero at {items} item ang binago",
    heroesAria: "Ilan sa mga hero na binago",
    read: "Basahin ang patch notes",
  },
  loop: {
    kicker: "Ang loop",
    title: "Mula patch day hanggang sa susunod mong session",
    patch: {
      title: "Basahin ang patch",
      body: "Tingnan kung aling mga pagbabago ang tumatama sa hero pool mo.",
    },
    draft: {
      title: "Mag-draft kasama ang mga kaibigan",
      body: "Mag-practice ng pick at ban na parang Captain's Mode.",
    },
    review: {
      title: "Mag-review nang magkasama",
      body: "Resulta ng solo at party, kasama ang sample size.",
    },
    experiment: {
      title: "Itakda ang susunod na eksperimento",
      body: "Pumili ng isang bagay na susubukan sa susunod na session.",
    },
  },
  features: {
    title: "Mga feature",
    party: {
      title: "Solo vs party, tapat",
      body: "Bawat match ay may label na solo, party o unknown, kasama ang pinagmulan. Hindi kailanman binibilang na solo ang kulang na data.",
    },
    patches: {
      title: "Patch hub",
      body: "Opisyal na patch notes na naka-link sa pinagmulan, naka-filter sa mga hero na talagang nilalaro mo.",
    },
    draft: {
      title: "Draft practice",
      body: "Pick/ban drills nang mag-isa o kasama ang mga kaibigan, may malinaw na dahilan sa halip na pekeng win odds.",
    },
  },
};
