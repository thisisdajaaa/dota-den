import {
  ConflictError,
  RateLimitedError,
  UpstreamUnavailableError,
} from "@/common/errors/app-error";
import { DEFAULT_LOCALE, isLocale, LOCALE_TAGS, type Locale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator, type Translator } from "@/common/i18n/translate";
import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { confirmationWaitMs, recentSends } from "../domain/confirmation-limit";
import { maskEmail } from "../domain/email-address";
import { renderEmail, type EmailContent } from "../domain/email-template";
import {
  CONFIRM_TOKEN_TTL_MS,
  confirmationTokenHash,
  newConfirmationToken,
  randomNonce,
  readUnsubscribeToken,
  unsubscribeToken,
} from "../domain/email-tokens";
import type { EmailLinks, EmailLogPort, EmailSender, EmailSubscriptionsPort } from "../email.ports";
import type { EmailStatusDto, TokenOutcomeDto } from "../dtos/responses/email-status.dto";

export interface Subscriber {
  userId: string;
  email: string;
  unsubscribeNonce: string;
}

export type SendResult = "sent" | "skipped" | "failed";

/**
 * The weekly email's consent and delivery: double opt-in, unsubscribe, and sending at most
 * once. Off (nothing is sent, the account page says so) without an email provider.
 */
export class EmailService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      subscriptions: EmailSubscriptionsPort;
      log: EmailLogPort;
      /** Null when RESEND_API_KEY and EMAIL_FROM aren't set: the feature is off. */
      sender: EmailSender | null;
      /** Signs the links in emails; null when email is off. */
      tokenKey: string | null;
      links: EmailLinks;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.sender !== null && this.deps.tokenKey !== null;
  }

  translatorFor(language: string | null | undefined): {
    t: Translator<Messages>;
    locale: Locale;
  } {
    const locale = isLocale(language) ? language : DEFAULT_LOCALE;
    return { t: translator(MESSAGES[locale], englishMessages), locale };
  }

  async status(userId: string): Promise<EmailStatusDto> {
    const sub = await this.deps.subscriptions.get(userId);
    return {
      enabled: this.enabled,
      email: sub?.email ?? null,
      status: sub?.status ?? "none",
    };
  }

  /**
   * Saves the address and emails a confirmation link. The same confirmed address is left
   * alone; a new address (or the same pending one again) gets a new link, rate-limited.
   */
  async subscribe(userId: string, email: string, language: string | null): Promise<EmailStatusDto> {
    const { sender, tokenKey } = this.deps;
    if (!sender || !tokenKey)
      throw new UpstreamUnavailableError("Email isn't set up on this server.");
    const now = this.now();
    const current = await this.deps.subscriptions.get(userId);
    if (current?.status === "confirmed" && current.email === email) return this.status(userId);
    const sends = current?.confirmSends ?? [];
    const wait = confirmationWaitMs(sends, now);
    if (wait !== null)
      throw new RateLimitedError(
        "Too many confirmation emails. Try again later.",
        Math.ceil(wait / 1000),
      );
    const token = newConfirmationToken(tokenKey);
    await this.deps.subscriptions.startConfirmation(
      userId,
      email,
      { hash: token.hash, expiresAt: new Date(now.getTime() + CONFIRM_TOKEN_TTL_MS) },
      [...recentSends(sends, now), now],
      now,
    );
    const { html, text, subject } = this.confirmationEmail(token.token, language);
    const outcome = await sender.send({ to: email, subject, html, text });
    if (!outcome.ok) {
      this.deps.logger.warn("email_confirmation_failed", {
        status: outcome.status,
        to: maskEmail(email),
      });
      throw new UpstreamUnavailableError("Couldn't send the confirmation email. Try again soon.");
    }
    this.deps.logger.info("email_confirmation_sent", { to: maskEmail(email) });
    return this.status(userId);
  }

  private confirmationEmail(token: string, language: string | null) {
    const { t, locale } = this.translatorFor(language);
    const content: EmailContent = {
      lang: LOCALE_TAGS[locale],
      subject: t("email.confirm.subject"),
      preheader: t("email.confirm.preheader"),
      heading: t("email.confirm.heading"),
      paragraphs: [t("email.confirm.body")],
      action: { label: t("email.confirm.action"), url: this.deps.links.confirm(token) },
      footer: [t("email.confirm.ignore")],
    };
    return { ...renderEmail(content), subject: content.subject };
  }

  /** A confirmation link was opened: the address gets the digest from now on. */
  async confirm(token: string): Promise<TokenOutcomeDto["outcome"]> {
    const key = this.deps.tokenKey;
    const hash = key ? confirmationTokenHash(key, token) : null;
    if (!hash) return "invalid";
    const done = await this.deps.subscriptions.confirm(hash, randomNonce(), this.now());
    return done ? "confirmed" : "invalid";
  }

  /** An unsubscribe link (or the one-click POST from a mail app). Works signed-out. */
  async unsubscribe(token: string): Promise<TokenOutcomeDto["outcome"]> {
    const key = this.deps.tokenKey;
    const who = key ? readUnsubscribeToken(key, token) : null;
    if (!who) return "invalid";
    if (await this.deps.subscriptions.unsubscribe(who.userId, who.nonce, this.now()))
      return "unsubscribed";
    // Already unsubscribed, or the link is from an earlier subscription than the current one.
    const current = await this.deps.subscriptions.get(who.userId);
    return current?.status === "confirmed" ? "stale" : "unsubscribed";
  }

  /** "Stop and delete my address" on the account page. */
  async remove(userId: string): Promise<EmailStatusDto> {
    await this.deps.subscriptions.remove(userId);
    return this.status(userId);
  }

  confirmedSubscribers(): Promise<Subscriber[]> {
    return this.deps.subscriptions.confirmed();
  }

  /** The confirmed subscription `sub` describes, still current (consent can change mid-run). */
  private async stillConsented(sub: Subscriber): Promise<boolean> {
    const current = await this.deps.subscriptions.get(sub.userId);
    return (
      current?.status === "confirmed" &&
      current.email === sub.email &&
      current.unsubscribeNonce === sub.unsubscribeNonce
    );
  }

  private unsubscribeLinks(tokenKey: string, sub: Subscriber) {
    const token = unsubscribeToken(tokenKey, sub.userId, sub.unsubscribeNonce);
    return {
      page: this.deps.links.unsubscribe(token),
      oneClick: this.deps.links.unsubscribeOneClick(token),
    };
  }

  /** Sends to a subscriber with RFC 8058 one-click unsubscribe headers. */
  private async deliver(
    sender: EmailSender,
    sub: Subscriber,
    content: EmailContent,
    oneClick: string,
    idempotencyKey?: string,
  ) {
    const { html, text } = renderEmail(content);
    return sender.send({
      to: sub.email,
      subject: content.subject,
      html,
      text,
      // Mail apps show an Unsubscribe button and POST "List-Unsubscribe=One-Click" here.
      headers: {
        "List-Unsubscribe": `<${oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey,
    });
  }

  /**
   * Sends one email at most once (per kind and key), only to a confirmed address that hasn't
   * changed since `sub` was read. `build` runs only when it may be sent and gets the
   * subscriber's unsubscribe links; null skips it (nothing to say).
   */
  async sendOnce(
    sub: Subscriber,
    kind: string,
    key: string,
    build: (unsubscribe: { page: string; oneClick: string }) => Promise<EmailContent | null>,
  ): Promise<SendResult> {
    const { sender, tokenKey } = this.deps;
    if (!sender || !tokenKey) return "skipped";
    if (!(await this.stillConsented(sub))) return "skipped";
    const links = this.unsubscribeLinks(tokenKey, sub);
    const content = await build(links);
    if (!content) return "skipped";
    if (!(await this.deps.log.claim(sub.userId, kind, key, this.now()))) return "skipped";
    const outcome = await this.deliver(
      sender,
      sub,
      content,
      links.oneClick,
      `${kind}/${sub.userId}/${key}`,
    );
    if (!outcome.ok) {
      // Let a later run try again.
      await this.deps.log.release(sub.userId, kind, key);
      this.deps.logger.warn("email_send_failed", {
        kind,
        userId: sub.userId,
        status: outcome.status,
      });
      return "failed";
    }
    await this.deps.log.recordSent(sub.userId, kind, key, outcome.id);
    return "sent";
  }

  /** "Send a test email" on the account page: only to the player's own confirmed address. */
  async sendTest(userId: string, language: string | null): Promise<void> {
    const { sender, tokenKey } = this.deps;
    if (!sender || !tokenKey)
      throw new UpstreamUnavailableError("Email isn't set up on this server.");
    const current = await this.deps.subscriptions.get(userId);
    if (current?.status !== "confirmed" || !current.unsubscribeNonce)
      throw new ConflictError("Confirm your email address first.");
    const sub = { userId, email: current.email, unsubscribeNonce: current.unsubscribeNonce };
    const links = this.unsubscribeLinks(tokenKey, sub);
    const { t, locale } = this.translatorFor(language);
    const content: EmailContent = {
      lang: LOCALE_TAGS[locale],
      subject: t("email.test.subject"),
      preheader: t("email.test.preheader"),
      heading: t("email.test.heading"),
      paragraphs: [t("email.test.body")],
      action: { label: t("email.digest.action"), url: this.deps.links.dashboard() },
      footer: [t("email.digest.why")],
      footerLinks: [
        { label: t("email.digest.unsubscribe"), url: links.page },
        { label: t("email.digest.settings"), url: this.deps.links.account() },
      ],
    };
    const outcome = await this.deliver(sender, sub, content, links.oneClick);
    if (!outcome.ok) {
      this.deps.logger.warn("email_test_failed", { userId, status: outcome.status });
      throw new UpstreamUnavailableError("Couldn't send the test email. Try again soon.");
    }
  }

  async exportMyData(owner: DataOwner) {
    const [subscription, sent] = await Promise.all([
      this.deps.subscriptions.exportForOwner(owner),
      this.deps.log.exportForOwner(owner),
    ]);
    return { emailSubscription: subscription, emailsSent: sent };
  }

  async deleteMyData(owner: DataOwner) {
    const [subscription, sent] = await Promise.all([
      this.deps.subscriptions.deleteForOwner(owner),
      this.deps.log.deleteForOwner(owner),
    ]);
    return { emailSubscription: subscription, emailsSent: sent };
  }
}
