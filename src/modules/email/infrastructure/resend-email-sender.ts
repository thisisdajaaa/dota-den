import "server-only";
import type { EmailSendOutcome, EmailSender, OutgoingEmail } from "../email.ports";

export const RESEND_API_BASE_URL = "https://api.resend.com";

/** Resend's REST API (POST /emails with a Bearer key). No SDK: one call, plain fetch. */
export class ResendEmailSender implements EmailSender {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly opts: {
      apiKey: string;
      /** "Dota Den <digest@example.com>": a verified sending domain. */
      from: string;
      baseUrl?: string;
      timeoutMs?: number;
      fetch?: typeof fetch;
    },
  ) {
    this.fetch = opts.fetch ?? fetch;
  }

  async send(email: OutgoingEmail): Promise<EmailSendOutcome> {
    const base = (this.opts.baseUrl ?? RESEND_API_BASE_URL).replace(/\/+$/, "");
    try {
      const res = await this.fetch(`${base}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
          ...(email.idempotencyKey ? { "idempotency-key": email.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: this.opts.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(email.headers ? { headers: email.headers } : {}),
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, status: res.status };
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
      return { ok: true, id: typeof body?.id === "string" ? body.id : null };
    } catch {
      return { ok: false };
    }
  }
}
