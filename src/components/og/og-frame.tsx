/**
 * Shared frame for link-preview images (Open Graph), rendered by next/og (Satori):
 * inline styles and flexbox only.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  bg: "#0d0b0a",
  panel: "#17130f",
  border: "#2a241d",
  gold: "#d8b15a",
  text: "#f2ede4",
  muted: "#a39a8c",
  win: "#3fb8a5",
  loss: "#d9573f",
};

export function OgFrame({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: `radial-gradient(900px 500px at 0% 0%, #3a2413 0%, ${OG.bg} 60%)`,
        color: OG.text,
        padding: "56px 64px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
          <span>DOTA</span>
          <span style={{ color: OG.gold, marginLeft: 12 }}>DEN</span>
        </div>
        <div style={{ display: "flex", fontSize: 22, color: OG.gold, letterSpacing: 4 }}>
          {kicker.toUpperCase()}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 40 }}>
        {children}
      </div>
    </div>
  );
}

/** A hero portrait for previews (Steam CDN image, or a dark tile without one). */
export function OgHero({ src, size = 96 }: { src: string | null; size?: number }) {
  const h = Math.round((size * 9) / 16);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
    <img
      alt=""
      src={src}
      width={size}
      height={h}
      style={{ borderRadius: 8, objectFit: "cover", border: `1px solid ${OG.border}` }}
    />
  ) : (
    <div
      style={{ width: size, height: h, borderRadius: 8, background: OG.panel, display: "flex" }}
    />
  );
}
