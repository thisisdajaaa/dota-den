/**
 * The share card as next/og (Satori) JSX: inline styles and flexbox only, every element with
 * more than one child is `display: flex`. Wide (1200×630) for link previews, square
 * (1080×1080) for Facebook posts and stories.
 */
import { OG } from "@/components/og/og-frame";
import { medalStep } from "@/modules/mmr/domain/journey";
import { CARD_SITE, CARD_SIZES, type CardFormat } from "../domain/share-card";
import type { ShareSnapshot } from "../domain/share";
import type { CardText } from "./share-card-text";

export type CardVisual =
  | { type: "streak"; n: number }
  | { type: "record"; wins: number; losses: number }
  | { type: "hero"; src: string | null; label: string }
  | { type: "year"; year: number }
  | { type: "journey"; medals: Array<{ at: number; rankTier: number }>; from: number; to: number };

const TONE = { win: OG.win, loss: OG.loss, gold: OG.gold } as const;
const GLOW = { win: "#123b36", loss: "#47190f", gold: "#3a2413" } as const;

/** What the big visual shows for a snapshot. */
export function cardVisual(
  s: ShareSnapshot,
  heroImage: (heroId: number) => string | null,
  resultLabel: string,
): CardVisual {
  switch (s.kind) {
    case "streak":
      return { type: "streak", n: s.games };
    case "match":
      return { type: "hero", src: heroImage(s.heroId), label: resultLabel };
    case "year":
      return { type: "year", year: s.year };
    case "journey":
      return {
        type: "journey",
        medals: s.medals.map((m) => ({ at: m.at.getTime(), rankTier: m.rankTier })),
        from: s.from.getTime(),
        to: Math.max((s.lastSeenAt ?? s.to).getTime(), s.from.getTime() + 86_400_000),
      };
    default:
      return { type: "record", wins: s.wins, losses: s.losses };
  }
}

/** The heroes along the bottom: most played first, without repeats. */
export function cardHeroIds(s: ShareSnapshot): number[] {
  const ids =
    s.kind === "match"
      ? []
      : s.kind === "week"
        ? [s.mostPlayed?.heroId, s.best?.heroId]
        : s.heroes.map((h) => h.heroId);
  return [...new Set(ids.filter((id): id is number => id != null))].slice(0, 5);
}

/** Shorter headlines get bigger type, so a record like "5W–2L" stays on one line. */
const headlineSize = (headline: string, [short, medium, long]: [number, number, number]) =>
  headline.length <= 20 ? short : headline.length <= 30 ? medium : long;

function Flame({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M12 1.5c.9 3.6-1.6 5.4-3.3 8C7.5 11.3 6.5 13 6.5 15.4a5.5 5.5 0 0 0 11 0c0-2.6-1.2-4.6-2.4-5.9.1 1.8-.5 3-1.7 3.6.6-4.1-.8-8.4-1.4-11.6z"
        fill="#e8692f"
      />
      <path
        d="M12.2 10.5c.3 1.9-1.1 2.8-1.9 4.1-.4.7-.7 1.3-.7 2.1a2.6 2.6 0 0 0 5.2 0c0-1.3-.6-2.3-1.2-3 0 .9-.3 1.4-.8 1.7.2-1.9-.3-3.4-.6-4.9z"
        fill="#f6c453"
      />
    </svg>
  );
}

function JourneyLine({
  v,
  width,
  height,
}: {
  v: Extract<CardVisual, { type: "journey" }>;
  width: number;
  height: number;
}) {
  const steps = v.medals.map((m) => medalStep(m.rankTier));
  const lo = Math.min(...steps) - 1;
  const hi = Math.max(...steps) + 1;
  const span = v.to - v.from;
  const x = (t: number) => ((Math.min(Math.max(t, v.from), v.to) - v.from) / span) * width;
  const y = (s: number) => 10 + ((hi - s) / (hi - lo)) * (height - 20);
  let d = "";
  v.medals.forEach((m, i) => {
    d += i === 0 ? `M${x(m.at)},${y(steps[i])}` : `V${y(steps[i])}`;
    d += `H${x(Math.max(v.medals[i + 1]?.at ?? v.to, m.at))}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke={OG.gold} strokeWidth={6} strokeLinejoin="round" />
      {v.medals.length > 0 && (
        <circle cx={x(v.medals.at(-1)!.at)} cy={y(steps.at(-1)!)} r={9} fill={OG.gold} />
      )}
    </svg>
  );
}

function Visual({
  v,
  tone,
  scale,
}: {
  v: CardVisual;
  tone: keyof typeof TONE;
  /** 1 on the wide card; larger on the square one. */
  scale: number;
}) {
  if (v.type === "streak")
    return (
      <div style={{ display: "flex", alignItems: "center" }}>
        <Flame size={150 * scale} />
        <span
          style={{
            fontSize: 190 * scale,
            fontWeight: 700,
            lineHeight: 1,
            color: OG.text,
            marginLeft: 4,
          }}
        >
          {v.n}
        </span>
      </div>
    );
  if (v.type === "year")
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontFamily: "Cinzel",
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 120 * scale, color: OG.gold }}>{v.year}</span>
        <span
          style={{
            fontSize: 30 * scale,
            color: OG.muted,
            letterSpacing: 8 * scale,
            marginTop: 12 * scale,
          }}
        >
          DOTA
        </span>
      </div>
    );
  if (v.type === "record")
    return (
      <div style={{ display: "flex", alignItems: "center", fontWeight: 700, lineHeight: 1 }}>
        <span style={{ fontSize: 150 * scale, color: OG.win }}>{v.wins}</span>
        <span style={{ fontSize: 90 * scale, color: OG.muted, margin: `0 ${14 * scale}px` }}>
          –
        </span>
        <span style={{ fontSize: 150 * scale, color: OG.loss }}>{v.losses}</span>
      </div>
    );
  if (v.type === "hero") {
    const w = Math.round(330 * scale);
    const h = Math.round((w * 9) / 16);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {v.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
          <img
            alt=""
            src={v.src}
            width={w}
            height={h}
            style={{ borderRadius: 16, objectFit: "cover", border: `3px solid ${TONE[tone]}` }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: w,
              height: h,
              borderRadius: 16,
              background: OG.panel,
              border: `3px solid ${TONE[tone]}`,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            marginTop: -22 * scale,
            padding: `${6 * scale}px ${22 * scale}px`,
            borderRadius: 999,
            background: TONE[tone],
            color: OG.bg,
            fontSize: 26 * scale,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          {v.label.toUpperCase()}
        </div>
      </div>
    );
  }
  return <JourneyLine v={v} width={Math.round(340 * scale)} height={Math.round(170 * scale)} />;
}

function HeroRow({ images, size }: { images: Array<string | null>; size: number }) {
  if (images.length === 0) return null;
  const h = Math.round((size * 9) / 16);
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {images.map((src, i) =>
        src ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
          <img
            key={i}
            alt=""
            src={src}
            width={size}
            height={h}
            style={{ borderRadius: 8, objectFit: "cover", border: `1px solid ${OG.border}` }}
          />
        ) : (
          <div
            key={i}
            style={{
              display: "flex",
              width: size,
              height: h,
              borderRadius: 8,
              background: OG.panel,
            }}
          />
        ),
      )}
    </div>
  );
}

function Stats({ text, size }: { text: CardText; size: number }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {text.stats.map((s) => (
        <div
          key={s.label}
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "12px 20px",
            borderRadius: 14,
            background: "rgba(23,19,15,0.85)",
            border: `1px solid ${OG.border}`,
            minWidth: 150,
          }}
        >
          <span style={{ fontSize: size * 0.45, color: OG.muted, letterSpacing: 2 }}>
            {s.label.toUpperCase()}
          </span>
          <span
            style={{
              fontSize: size,
              fontWeight: 700,
              color: s.tone ? TONE[s.tone] : OG.text,
              marginTop: 2,
            }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Cinzel",
        fontSize: size,
        fontWeight: 700,
        letterSpacing: 3,
      }}
    >
      <span>DOTA</span>
      <span style={{ color: OG.gold, marginLeft: size * 0.35 }}>DEN</span>
    </div>
  );
}

function Footer({ text, size }: { text: CardText; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: size, color: OG.muted }}>
      <span>{text.footer}</span>
      <span style={{ color: OG.gold, fontWeight: 700, marginLeft: 8 }}>{CARD_SITE}</span>
    </div>
  );
}

export function ShareCardImage({
  text,
  format,
  playerName,
  visual,
  heroImages,
}: {
  text: CardText;
  format: CardFormat;
  playerName: string;
  visual: CardVisual;
  heroImages: Array<string | null>;
}) {
  const { width, height } = CARD_SIZES[format];
  const frame = {
    width,
    height,
    display: "flex",
    flexDirection: "column" as const,
    background: `radial-gradient(${width}px ${height * 0.9}px at 0% 0%, ${GLOW[text.tone]} 0%, ${OG.bg} 65%)`,
    color: OG.text,
    fontFamily: "Geist",
    borderTop: `10px solid ${TONE[text.tone]}`,
  };
  const top = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Wordmark size={format === "wide" ? 34 : 44} />
      <div
        style={{
          display: "flex",
          fontSize: format === "wide" ? 22 : 28,
          color: OG.gold,
          letterSpacing: 5,
          fontWeight: 700,
        }}
      >
        {text.kicker.toUpperCase()}
      </div>
    </div>
  );

  if (format === "wide")
    return (
      <div style={{ ...frame, padding: "44px 60px 40px" }}>
        {top}
        <div style={{ display: "flex", flex: 1, marginTop: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 30 }}>
            <div style={{ display: "flex", fontSize: 32, color: OG.muted }}>{playerName}</div>
            <div
              style={{
                display: "flex",
                fontSize: headlineSize(text.headline, [62, 56, 50]),
                fontWeight: 700,
                lineHeight: 1.08,
                marginTop: 6,
              }}
            >
              {text.headline}
            </div>
            {text.sub && (
              <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 14 }}>
                {text.sub}
              </div>
            )}
            <div style={{ display: "flex", marginTop: "auto" }}>
              <Stats text={text} size={40} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              width: 360,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Visual v={visual} tone={text.tone} scale={1} />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            minHeight: 50,
          }}
        >
          <HeroRow images={heroImages} size={88} />
          <div style={{ display: "flex", marginLeft: "auto" }}>
            <Footer text={text} size={24} />
          </div>
        </div>
      </div>
    );

  return (
    <div style={{ ...frame, padding: "56px 64px 52px" }}>
      {top}
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Visual v={visual} tone={text.tone} scale={1.5} />
        <div style={{ display: "flex", fontSize: 40, color: OG.muted, marginTop: 36 }}>
          {playerName}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            fontSize: headlineSize(text.headline, [76, 66, 58]),
            fontWeight: 700,
            lineHeight: 1.08,
            marginTop: 8,
            maxWidth: 952,
          }}
        >
          {text.headline}
        </div>
        {text.sub && (
          <div style={{ display: "flex", fontSize: 32, color: OG.muted, marginTop: 18 }}>
            {text.sub}
          </div>
        )}
        <div style={{ display: "flex", marginTop: 36 }}>
          <Stats text={text} size={48} />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
        }}
      >
        <HeroRow images={heroImages} size={110} />
        <Footer text={text} size={30} />
      </div>
    </div>
  );
}
