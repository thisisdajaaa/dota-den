import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The site's own (self-hosted) fonts for next/og images. Satori reads TTF, not WOFF2: Geist
 * comes from the `geist` package's TTFs, the Cinzel wordmark from a static 700 TTF vendored
 * next to the site's variable WOFF2 (both OFL). next.config.ts traces these files into the
 * routes that read them.
 */
export type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

let loaded: Promise<OgFont[]> | null = null;

// Literal paths, so the build traces just these files (not the whole project).
const read = () =>
  Promise.all([
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf")),
    readFile(join(process.cwd(), "src/app/fonts/cinzel-latin-700.ttf")),
  ]);

/** Read once per server instance; a failed read is retried on the next image. */
export function ogFonts(): Promise<OgFont[]> {
  loaded ??= read().then(
    ([regular, bold, cinzel]): OgFont[] => [
      { name: "Geist", weight: 400, style: "normal", data: regular },
      { name: "Geist", weight: 700, style: "normal", data: bold },
      { name: "Cinzel", weight: 700, style: "normal", data: cinzel },
    ],
    (error: unknown) => {
      loaded = null;
      throw error;
    },
  );
  return loaded;
}
