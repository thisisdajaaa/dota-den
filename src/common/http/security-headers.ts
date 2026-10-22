/**
 * Response headers every page and route gets (next.config.ts `headers()`). Pure data, no
 * imports: next.config.ts loads this file before the app is built.
 *
 * The Content Security Policy ships as Report-Only first: browsers log what it would block
 * without blocking it. docs/operations.md ("Security headers") says how to make it enforcing.
 */

/** Sites whose players we embed on the live pages (iframes we load, not frames of us). */
const PLAYER_ORIGINS = ["https://player.twitch.tv", "https://player.kick.com"] as const;

/** Where the browser loads images from: Steam/Valve CDNs (hotlinked) and the stream sites. */
const IMAGE_SOURCES = [
  "https://cdn.cloudflare.steamstatic.com",
  "https://avatars.steamstatic.com",
  // Rank medal artwork as served by OpenDota.
  "https://www.opendota.com",
  // Twitch avatars and previews (static-cdn.jtvnw.net) and Kick's (images/files.kick.com).
  "https://*.jtvnw.net",
  "https://kick.com",
  "https://*.kick.com",
] as const;

/** Frames we embed: the players plus Twitch's chat (www.twitch.tv/embed/…). */
const FRAME_SOURCES = [...PLAYER_ORIGINS, "https://www.twitch.tv"] as const;

/**
 * The policy. Next.js renders inline scripts (the RSC payload) without a nonce unless every
 * page is rendered per request, so scripts need 'unsafe-inline'; `next dev` also needs
 * 'unsafe-eval' and a websocket for hot reload. Browser code only calls our own API, and
 * push endpoints and upstream APIs (OpenDota, Groq, Upstash) are called from the server.
 */
export function contentSecurityPolicy(opts: { dev: boolean }): string {
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...IMAGE_SOURCES],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(opts.dev ? ["ws:", "wss:"] : [])],
    "frame-src": FRAME_SOURCES,
    "media-src": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const allow = (origins: readonly string[]) => `(self ${origins.map((o) => `"${o}"`).join(" ")})`;

/**
 * Browser features. Our own iframes can only be granted what this allows, so the stream
 * players keep autoplay, fullscreen and picture-in-picture (their `allow` attributes). The
 * share button uses the Web Share API. Nothing uses the camera, microphone or location.
 * (Push notifications aren't a Permissions-Policy feature.)
 */
export const PERMISSIONS_POLICY = [
  `autoplay=${allow(PLAYER_ORIGINS)}`,
  `fullscreen=${allow(PLAYER_ORIGINS)}`,
  `picture-in-picture=${allow(PLAYER_ORIGINS)}`,
  "web-share=(self)",
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "display-capture=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "bluetooth=()",
  "midi=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "browsing-topics=()",
].join(", ");

/** The headers for every response. */
export function securityHeaders(opts: { dev: boolean }): Array<{ key: string; value: string }> {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Nothing of ours is meant to be framed: link previews use images (/og), not frames.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    // Two years. Browsers ignore it over plain http (local `next start`). No includeSubDomains:
    // other hosts on the domain aren't ours to force onto https.
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(opts) },
  ];
}
