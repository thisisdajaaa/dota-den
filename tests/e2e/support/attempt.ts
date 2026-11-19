import { test } from "@playwright/test";

/**
 * Which run of the current test this is: 0 for the first, then one per retry (CI retries
 * twice) and per `--repeat-each` copy. All runs share one database.
 */
export function attempt(): number {
  const { retry, repeatEachIndex } = test.info();
  return repeatEachIndex * 10 + retry;
}

/**
 * A synthetic SteamID64 of its own for this run of the test, so a retry never starts from
 * what a failed run left behind (a subscription, a saved setting). The first run uses `base`
 * itself; later runs move a million accounts up, far past every identity the specs name.
 * Only for identities the fixture server has no data for (any account works there).
 */
export function attemptSteamId(base: string): string {
  return (BigInt(base) + BigInt(attempt()) * 1_000_000n).toString();
}
