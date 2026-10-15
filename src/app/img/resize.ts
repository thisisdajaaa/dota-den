import "server-only";
import sharp from "sharp";

/** Recently resized images on this server, so repeat requests skip the fetch and resize. */
const memory = new Map<string, Uint8Array>();
const MEMORY_MAX = 400;

const HEADERS = {
  "content-type": "image/webp",
  // Art rarely changes: a month on the CDN, a week in browsers.
  "cache-control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
};

/** Fetches `source`, resizes it to `width` as WebP, and answers with long cache headers. */
export async function resizedImage(source: string, width: number, quality: number) {
  const key = `${source}@${width}`;
  const cached = memory.get(key);
  if (cached) return new Response(new Uint8Array(cached), { headers: HEADERS });
  const upstream = await fetch(source, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!upstream?.ok) return new Response(null, { status: upstream?.status === 404 ? 404 : 502 });
  const image = new Uint8Array(
    await sharp(Buffer.from(await upstream.arrayBuffer()))
      .resize({ width })
      .webp({ quality })
      .toBuffer(),
  );
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value!);
  memory.set(key, image);
  return new Response(new Uint8Array(image), { headers: HEADERS });
}
