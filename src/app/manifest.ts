import type { MetadataRoute } from "next";

/** Lets Dota Den be installed to a phone's home screen or as a desktop app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dota Den",
    short_name: "Dota Den",
    description:
      "An unofficial Dota 2 companion: your matches, MMR journal, sessions, draft practice and live games.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0605",
    theme_color: "#0a0605",
    categories: ["games", "sports", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Overview", url: "/dashboard" },
      { name: "Log MMR", url: "/mmr" },
      { name: "Draft", url: "/draft" },
      { name: "Live games", url: "/live" },
    ],
  };
}
