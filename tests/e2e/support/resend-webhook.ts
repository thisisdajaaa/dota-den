import { createHmac } from "node:crypto";

/** The Resend webhook signing secret the E2E server runs with (a throwaway test value). */
export const E2E_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("dota-den-e2e-webhook-secret-0001").toString("base64")}`;

/** Svix headers for `body`, as Resend would send them (written independently of the app's code). */
export function svixHeaders(
  body: string,
  opts: { id?: string; secret?: string; at?: Date } = {},
): Record<string, string> {
  const id = opts.id ?? `msg_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const timestamp = String(Math.floor((opts.at ?? new Date()).getTime() / 1000));
  const key = Buffer.from(
    (opts.secret ?? E2E_RESEND_WEBHOOK_SECRET).slice("whsec_".length),
    "base64",
  );
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
}
