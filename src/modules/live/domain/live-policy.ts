/**
 * How long the live games list is cached, and how often live pages refresh. One value for
 * both: a page that refreshes faster than the cache lasts makes an upstream call every time.
 */
export const LIVE_CACHE_SECONDS = 60;
