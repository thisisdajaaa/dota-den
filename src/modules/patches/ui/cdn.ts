const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com";

/** Absolute URL for a Dota CDN path, or null for anything outside the allowed tree. */
export function steamCdn(path: string | null): string | null {
  if (!path || path.includes("..") || !/^\/apps\/dota2\/[\w./-]+\.png$/.test(path)) return null;
  return `${STEAM_CDN}${path}`;
}
