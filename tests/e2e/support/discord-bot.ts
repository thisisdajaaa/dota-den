import { createPrivateKey, createPublicKey, sign } from "node:crypto";

/**
 * A fixed test key for the bot's interaction signatures: Playwright loads its config in every
 * worker, so a random key would differ between the app server and the tests. Never a real key.
 */
const SEED = Buffer.from("d0de4e2eb07e57".repeat(5).slice(0, 64), "hex");
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), SEED]),
  format: "der",
  type: "pkcs8",
});

/** The application's public key as Discord shows it (32 bytes, hex). */
export const E2E_DISCORD_PUBLIC_KEY = createPublicKey(privateKey)
  .export({ format: "der", type: "spki" })
  .subarray(12)
  .toString("hex");
export const E2E_DISCORD_APP_ID = "100000000000000099";

/** Headers Discord would send with this body. */
export function signInteraction(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    "content-type": "application/json",
    "x-signature-timestamp": timestamp,
    "x-signature-ed25519": sign(null, Buffer.from(timestamp + body), privateKey).toString("hex"),
  };
}
