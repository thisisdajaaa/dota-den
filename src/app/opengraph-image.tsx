import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame } from "@/components/og/og-frame";

export const alt = "Dota Den: your Dota 2 companion";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The default link preview for every page without its own. */
export default function Image() {
  return new ImageResponse(
    <OgFrame kicker="Dota 2 companion">
      <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
        Honest answers about your own games.
      </div>
      <div style={{ display: "flex", fontSize: 32, color: OG.muted, marginTop: 28, maxWidth: 960 }}>
        Match history, MMR journal, teammates, the current meta, and a Captain&apos;s Mode trainer
        with an AI captain.
      </div>
    </OgFrame>,
    size,
  );
}
