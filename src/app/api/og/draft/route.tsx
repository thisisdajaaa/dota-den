import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { decodeSnapshot, replaySnapshot } from "@/modules/drafts/application/snapshot";
import { getAiOpponent } from "@/modules/drafts/composition";
import { matchesService } from "@/modules/matches";

/** Link preview for a shared draft: both lineups, and the report card when it's finished. */
export async function GET(req: NextRequest): Promise<ImageResponse> {
  const raw = req.nextUrl.searchParams.get("snapshot") ?? "";
  const heroes = await matchesService.heroMap();
  const decoded = raw.length <= 2_000 ? decodeSnapshot(raw) : null;
  // Replayed through the rules engine: a tampered link can't render a made-up draft.
  const replayed = decoded?.ok ? replaySnapshot(decoded.value, [...heroes.keys()]) : null;
  if (!replayed?.ok || !decoded?.ok) {
    return new ImageResponse(
      <OgFrame kicker="Draft">
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>
          Captain&apos;s Mode draft
        </div>
      </OgFrame>,
      OG_SIZE,
    );
  }
  const state = replayed.value;
  const outlook =
    state.status === "completed"
      ? await (
          await getAiOpponent()
        )
          .outlook(decoded.value)
          .then((r) => (r.ok ? r.value : null))
          .catch(() => null)
      : null;
  const row = (side: "radiant" | "dire") => {
    const grade = outlook?.report[side];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            width: 150,
            flexShrink: 0,
            fontSize: 30,
            fontWeight: 700,
            color: side === "radiant" ? OG.win : OG.loss,
          }}
        >
          {side === "radiant" ? "Radiant" : "Dire"}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {state.sides[side].picks.map((p, i) => (
            <OgHero key={i} src={heroes.get(p.heroId)?.imageUrl ?? null} size={136} />
          ))}
        </div>
        {grade?.grade && (
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              width: 150,
              flexShrink: 0,
              justifyContent: "flex-end",
              alignItems: "baseline",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 64, fontWeight: 700, color: OG.gold }}>{grade.grade}</span>
            <span style={{ fontSize: 24, color: OG.muted }}>{grade.overall}/100</span>
          </div>
        )}
      </div>
    );
  };
  return new ImageResponse(
    <OgFrame kicker="Draft">
      <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>
        {state.status === "completed" ? "Captain's Mode draft" : "Draft in progress"}
      </div>
      <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 8 }}>
        {outlook?.radiantPct != null
          ? `Estimated from the draft: Radiant ${outlook.radiantPct}% · Dire ${100 - outlook.radiantPct}%`
          : `${state.turns.length} of the draft's steps taken`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 44 }}>
        {row("radiant")}
        {row("dire")}
      </div>
    </OgFrame>,
    { ...OG_SIZE, headers: { "cache-control": "public, max-age=86400, immutable" } },
  );
}
