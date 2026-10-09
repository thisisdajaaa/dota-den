import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/common/config/env";
import { CONFIRM_MAX_PER_DAY, confirmationWaitMs } from "@/modules/email/domain/confirmation-limit";
import {
  longestLossStreak,
  newAchievement,
  pickNote,
  tiltNote,
  type DigestWeek,
} from "@/modules/email/domain/digest";
import { isEmailAddress, maskEmail, normalizeEmail } from "@/modules/email/domain/email-address";
import { escapeHtml, renderEmail } from "@/modules/email/domain/email-template";
import {
  confirmationTokenHash,
  hashToken,
  newConfirmationToken,
  readUnsubscribeToken,
  unsubscribeToken,
} from "@/modules/email/domain/email-tokens";
import type {
  EmailLinks,
  EmailLogPort,
  EmailSender,
  EmailSubscription,
  EmailSubscriptionsPort,
  OutgoingEmail,
  PlayHistorySource,
  WeekSource,
} from "@/modules/email/email.ports";
import { ResendEmailSender } from "@/modules/email/infrastructure/resend-email-sender";
import { SubscribeEmailSchema } from "@/modules/email/schemas/email.schema";
import { EmailDigestService } from "@/modules/email/services/email-digest.service";
import { EmailService } from "@/modules/email/services/email.service";

const KEY = "test-signing-key-0123456789abcdef0123456789";
const HOUR = 3_600_000;

describe("email addresses", () => {
  it("accepts plain addresses and normalises them", () => {
    expect(normalizeEmail("  Player@Example.COM ")).toBe("player@example.com");
    expect(isEmailAddress("player+dota@mail.example.ph")).toBe(true);
    for (const bad of [
      "player",
      "player@example",
      "a b@example.com",
      "a@example.com\r\nBcc: x@evil.example",
      "a@example.com, b@example.com",
      "<a@example.com>",
      `${"a".repeat(250)}@example.com`,
    ])
      expect(isEmailAddress(bad)).toBe(false);
  });

  it("validates request bodies through the same rule", () => {
    expect(SubscribeEmailSchema.parse({ email: " Me@Example.com " })).toEqual({
      email: "me@example.com",
    });
    expect(SubscribeEmailSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(SubscribeEmailSchema.safeParse({ email: "a@b.co", extra: 1 }).success).toBe(false);
  });

  it("masks addresses for logs", () => {
    expect(maskEmail("daja@example.com")).toBe("d***@example.com");
    expect(maskEmail("broken")).toBe("***");
  });
});

describe("email link tokens", () => {
  it("signs confirmation tokens and stores only their hash", () => {
    const { token, hash } = newConfirmationToken(KEY);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(confirmationTokenHash(KEY, token)).toBe(hash);
    expect(confirmationTokenHash("another-key-0123456789abcdef0123456789", token)).toBeNull();
    const [v, random, sig] = token.split(".");
    expect(confirmationTokenHash(KEY, `${v}.${random}x.${sig}`)).toBeNull();
    expect(confirmationTokenHash(KEY, "garbage")).toBeNull();
    expect(newConfirmationToken(KEY).token).not.toBe(token);
  });

  it("binds unsubscribe tokens to a user and a subscription nonce", () => {
    const token = unsubscribeToken(KEY, "user-1", "nonce-a");
    expect(readUnsubscribeToken(KEY, token)).toEqual({ userId: "user-1", nonce: "nonce-a" });
    expect(readUnsubscribeToken("another-key-0123456789abcdef0123456789", token)).toBeNull();
    // Swapping in someone else's id breaks the signature.
    const [v, , nonce, sig] = token.split(".");
    const forged = `${v}.${Buffer.from("user-2").toString("base64url")}.${nonce}.${sig}`;
    expect(readUnsubscribeToken(KEY, forged)).toBeNull();
    expect(readUnsubscribeToken(KEY, `${token}.extra`)).toBeNull();
  });
});

describe("confirmation rate limit", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("waits a minute between sends and allows a few a day", () => {
    expect(confirmationWaitMs([], now)).toBeNull();
    expect(confirmationWaitMs([ago(30_000)], now)).toBe(30_000);
    expect(confirmationWaitMs([ago(61_000)], now)).toBeNull();
    const five = Array.from({ length: CONFIRM_MAX_PER_DAY }, (_, i) => ago((i + 1) * HOUR));
    expect(confirmationWaitMs(five, now)).toBe(HOUR * 24 - CONFIRM_MAX_PER_DAY * HOUR);
    // Sends older than a day don't count.
    expect(
      confirmationWaitMs(
        five.map((d) => new Date(d.getTime() - 24 * HOUR)),
        now,
      ),
    ).toBeNull();
  });
});

describe("email template", () => {
  it("escapes every piece of text and keeps links http(s)", () => {
    const { html, text } = renderEmail({
      lang: "en",
      subject: "<b>hi</b>",
      preheader: "pre & post",
      heading: `Pudge "the" <script>alert(1)</script>`,
      rows: [{ label: "Hero", value: "<img src=x onerror=alert(1)>" }],
      paragraphs: ["It's 5 > 3"],
      action: { label: "Open", url: "https://dota.example/dashboard?a=1&b=2" },
      footerLinks: [{ label: "Unsubscribe", url: "https://dota.example/u?token=a.b" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;the&quot;");
    expect(html).toContain('href="https://dota.example/dashboard?a=1&amp;b=2"');
    expect(text).toContain("Hero: <img src=x onerror=alert(1)>");
    expect(text).toContain("Unsubscribe: https://dota.example/u?token=a.b");
    expect(escapeHtml(`'&'`)).toBe("&#39;&amp;&#39;");
    expect(() =>
      renderEmail({
        lang: "en",
        subject: "x",
        preheader: "x",
        heading: "x",
        action: { label: "x", url: "javascript:alert(1)" },
      }),
    ).toThrow();
  });
});

describe("digest notes", () => {
  const at = (day: number, result: "win" | "loss", heroId = 1) => ({
    startedAt: new Date(Date.UTC(2026, 9, day, 12)),
    result,
    heroId,
  });
  // The week is Oct 4-10.
  const weekOf = (d: Date) => (d.getUTCDate() < 4 ? -1 : d.getUTCDate() > 10 ? 1 : 0) as -1 | 0 | 1;

  it("finds an achievement tier first reached during the week", () => {
    const before = { matches: [at(1, "win"), at(1, "win")] };
    const during = { matches: [at(5, "win", 2), at(5, "win", 3)] };
    // Four wins in a row across the boundary: the 3-streak tier is reached in the week.
    expect(newAchievement([before, during], weekOf)).toEqual({
      kind: "achievement",
      id: "streak",
      n: 3,
    });
    // Already reached before the week: nothing new.
    const earlier = { matches: [at(1, "win"), at(1, "win"), at(1, "win")] };
    expect(newAchievement([earlier, { matches: [at(5, "loss")] }], weekOf)).toBeNull();
  });

  it("only reports the tilt check's observation with a streak and enough history", () => {
    const sessions = [{ matches: [at(5, "loss"), at(5, "loss"), at(5, "loss"), at(5, "win")] }];
    expect(longestLossStreak(sessions, weekOf)).toBe(3);
    expect(longestLossStreak([{ matches: [at(1, "loss"), at(1, "loss")] }], weekOf)).toBe(0);
    const stats = {
      baseline: { games: 300, wins: 156, rate: 0.52 },
      afterLosses: {
        2: { games: 60, wins: 27, rate: 0.45 },
        3: { games: 25, wins: 10, rate: 0.4 },
      },
    };
    expect(tiltNote(stats, 3)).toMatchObject({ kind: "tilt", streak: 3, after: { rate: 0.4 } });
    expect(tiltNote(stats, 1)).toBeNull();
    const thin = {
      ...stats,
      afterLosses: { ...stats.afterLosses, 3: { games: 5, wins: 1, rate: 0.2 } },
    };
    expect(tiltNote(thin, 3)).toBeNull();
    expect(pickNote(null, tiltNote(stats, 2))).toMatchObject({ kind: "tilt" });
    expect(pickNote(null, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------
// Services, with in-memory fakes.

function fakeSubscriptions() {
  const docs = new Map<
    string,
    EmailSubscription & { tokenHash: string | null; expiresAt: Date | null }
  >();
  const port: EmailSubscriptionsPort = {
    get: async (userId) => {
      const d = docs.get(userId);
      return d
        ? {
            userId,
            email: d.email,
            status: d.status,
            confirmSends: d.confirmSends,
            unsubscribeNonce: d.unsubscribeNonce,
          }
        : null;
    },
    startConfirmation: async (userId, email, token, sends) => {
      docs.set(userId, {
        userId,
        email,
        status: "pending",
        confirmSends: sends,
        unsubscribeNonce: null,
        tokenHash: token.hash,
        expiresAt: token.expiresAt,
      });
    },
    confirm: async (hash, nonce, now) => {
      for (const d of docs.values())
        if (d.tokenHash === hash && d.status === "pending" && d.expiresAt! > now) {
          Object.assign(d, { status: "confirmed", tokenHash: null, unsubscribeNonce: nonce });
          return { userId: d.userId };
        }
      return null;
    },
    unsubscribe: async (userId, nonce) => {
      const d = docs.get(userId);
      if (!d || d.status !== "confirmed" || d.unsubscribeNonce !== nonce) return false;
      Object.assign(d, { status: "unsubscribed", unsubscribeNonce: null });
      return true;
    },
    remove: async (userId) => docs.delete(userId),
    confirmed: async () =>
      [...docs.values()]
        .filter((d) => d.status === "confirmed")
        .map((d) => ({ userId: d.userId, email: d.email, unsubscribeNonce: d.unsubscribeNonce! })),
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  return { docs, port };
}

function fakeLog() {
  const claimed = new Set<string>();
  const port: EmailLogPort = {
    claim: async (u, k, key) => {
      const id = `${u}:${k}:${key}`;
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
    release: async (u, k, key) => {
      claimed.delete(`${u}:${k}:${key}`);
    },
    recordSent: async () => {},
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  return { claimed, port };
}

function fakeSender(ok = true) {
  const sent: OutgoingEmail[] = [];
  const sender: EmailSender & { ok: boolean } = {
    ok,
    async send(email) {
      sent.push(email);
      return this.ok ? { ok: true, id: `id-${sent.length}` } : { ok: false, status: 500 };
    },
  };
  return { sent, sender };
}

const links: EmailLinks = {
  confirm: (t) => `https://dota.example/email/confirm?token=${encodeURIComponent(t)}`,
  unsubscribe: (t) => `https://dota.example/email/unsubscribe?token=${encodeURIComponent(t)}`,
  unsubscribeOneClick: (t) =>
    `https://dota.example/api/v1/email/unsubscribe?token=${encodeURIComponent(t)}`,
  dashboard: () => "https://dota.example/dashboard",
  account: () => "https://dota.example/account#email",
};

const logger = { info: vi.fn(), warn: vi.fn() };

function setup(opts: { sender?: boolean; now?: () => Date } = {}) {
  const subs = fakeSubscriptions();
  const log = fakeLog();
  const mail = fakeSender();
  let clock = new Date("2026-10-12T00:00:00Z");
  const now = opts.now ?? (() => clock);
  const service = new EmailService({
    subscriptions: subs.port,
    log: log.port,
    sender: opts.sender === false ? null : mail.sender,
    tokenKey: opts.sender === false ? null : KEY,
    links,
    logger,
    now,
  });
  return {
    service,
    subs,
    log,
    mail,
    tick: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}

const tokenFrom = (email: OutgoingEmail) => {
  const m = /token=([^\s"&]+)/.exec(email.text);
  return decodeURIComponent(m![1]);
};

describe("EmailService (double opt-in)", () => {
  it("is off without a provider: nothing is saved or sent", async () => {
    const { service, subs } = setup({ sender: false });
    expect(service.enabled).toBe(false);
    expect(await service.status("u1")).toEqual({ enabled: false, email: null, status: "none" });
    await expect(service.subscribe("u1", "a@example.com", "en")).rejects.toMatchObject({
      code: "upstream_unavailable",
    });
    expect(subs.docs.size).toBe(0);
  });

  it("emails a signed link, confirms once, and never logs the address", async () => {
    const { service, mail } = setup();
    const status = await service.subscribe("u1", "player@example.com", "fil");
    expect(status).toEqual({ enabled: true, email: "player@example.com", status: "pending" });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "player@example.com" });
    expect(mail.sent[0].subject).toBe("Kumpirmahin ang lingguhang email mo sa Dota Den");
    expect(mail.sent[0].html).toContain("https://dota.example/email/confirm?token=c1.");
    const token = tokenFrom(mail.sent[0]);
    expect(await service.confirm(token)).toBe("confirmed");
    expect((await service.status("u1")).status).toBe("confirmed");
    // Single use.
    expect(await service.confirm(token)).toBe("invalid");
    expect(await service.confirm("c1.forged.sig")).toBe("invalid");
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("player@example.com");
  });

  it("expires confirmation links after 24 hours", async () => {
    const { service, mail, tick } = setup();
    await service.subscribe("u1", "player@example.com", null);
    tick(25 * HOUR);
    expect(await service.confirm(tokenFrom(mail.sent[0]))).toBe("invalid");
  });

  it("rate-limits confirmation emails and restarts confirmation for a new address", async () => {
    const { service, mail, tick } = setup();
    await service.subscribe("u1", "one@example.com", null);
    await expect(service.subscribe("u1", "one@example.com", null)).rejects.toMatchObject({
      code: "rate_limited",
    });
    tick(61_000);
    await service.subscribe("u1", "one@example.com", null);
    // The newer link replaces the older one.
    expect(await service.confirm(tokenFrom(mail.sent[0]))).toBe("invalid");
    expect(await service.confirm(tokenFrom(mail.sent[1]))).toBe("confirmed");
    // Same confirmed address again: nothing to do.
    tick(61_000);
    await service.subscribe("u1", "one@example.com", null);
    expect(mail.sent).toHaveLength(2);
    // A new address goes back to pending until it's confirmed.
    await service.subscribe("u1", "two@example.com", null);
    expect(await service.status("u1")).toMatchObject({
      email: "two@example.com",
      status: "pending",
    });
    expect(await service.confirmedSubscribers()).toEqual([]);
    for (let i = 0; i < 2; i++) {
      tick(61_000);
      await service.subscribe("u1", "two@example.com", null);
    }
    tick(61_000);
    // Five in a day is the most.
    await expect(service.subscribe("u1", "three@example.com", null)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("reports a failed confirmation send", async () => {
    const { service, mail } = setup();
    mail.sender.ok = false;
    await expect(service.subscribe("u1", "a@example.com", null)).rejects.toMatchObject({
      code: "upstream_unavailable",
    });
  });
});

async function confirmedUser(s: ReturnType<typeof setup>, userId = "u1", email = "p@example.com") {
  await s.service.subscribe(userId, email, null);
  await s.service.confirm(tokenFrom(s.mail.sent.at(-1)!));
  return (await s.service.confirmedSubscribers()).find((x) => x.userId === userId)!;
}

describe("EmailService (sending and unsubscribing)", () => {
  const content = async () => ({
    lang: "en",
    subject: "Your week",
    preheader: "p",
    heading: "h",
  });

  it("sends once per key, with one-click unsubscribe headers", async () => {
    const s = setup();
    const sub = await confirmedUser(s);
    const build = vi.fn(content);
    expect(await s.service.sendOnce(sub, "weekly_digest", "2026-10-12", build)).toBe("sent");
    expect(await s.service.sendOnce(sub, "weekly_digest", "2026-10-12", build)).toBe("skipped");
    const email = s.mail.sent.at(-1)!;
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.headers?.["List-Unsubscribe"]).toMatch(
      /^<https:\/\/dota\.example\/api\/v1\/email\/unsubscribe\?token=u1\..+>$/,
    );
    expect(email.idempotencyKey).toBe("weekly_digest/u1/2026-10-12");
    const [links] = build.mock.calls[0] as unknown as [{ page: string }];
    expect(links.page).toContain("/email/unsubscribe?token=u1.");
  });

  it("sends a test only to a confirmed address, with an unsubscribe link", async () => {
    const s = setup();
    await s.service.subscribe("u1", "p@example.com", null);
    await expect(s.service.sendTest("u1", null)).rejects.toMatchObject({ code: "conflict" });
    await s.service.confirm(tokenFrom(s.mail.sent[0]));
    await s.service.sendTest("u1", "fil");
    const email = s.mail.sent.at(-1)!;
    expect(email.to).toBe("p@example.com");
    expect(email.subject).toContain("Test:");
    expect(email.text).toContain("/email/unsubscribe?token=u1.");
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("releases the claim when the provider fails, so a later run retries", async () => {
    const s = setup();
    const sub = await confirmedUser(s);
    s.mail.sender.ok = false;
    expect(await s.service.sendOnce(sub, "weekly_digest", "k", content)).toBe("failed");
    s.mail.sender.ok = true;
    expect(await s.service.sendOnce(sub, "weekly_digest", "k", content)).toBe("sent");
  });

  it("never sends without current consent", async () => {
    const s = setup();
    const sub = await confirmedUser(s);
    expect(await s.service.sendOnce(sub, "weekly_digest", "a", content)).toBe("sent");
    const header = s.mail.sent.at(-1)!.headers!["List-Unsubscribe"];
    const token = decodeURIComponent(/token=([^>]+)>/.exec(header)![1]);
    expect(await s.service.unsubscribe(token)).toBe("unsubscribed");
    expect((await s.service.status("u1")).status).toBe("unsubscribed");
    // Already done: still says so.
    expect(await s.service.unsubscribe(token)).toBe("unsubscribed");
    expect(await s.service.sendOnce(sub, "weekly_digest", "b", content)).toBe("skipped");
    expect(await s.service.unsubscribe("u1.bad.token.sig")).toBe("invalid");

    // Subscribed again: the old link can't end the new subscription.
    s.tick(61_000);
    const again = await confirmedUser(s);
    expect(again.unsubscribeNonce).not.toBe(sub.unsubscribeNonce);
    expect(await s.service.unsubscribe(token)).toBe("stale");
    expect((await s.service.status("u1")).status).toBe("confirmed");

    // Removing the address stops everything.
    await s.service.remove("u1");
    expect(await s.service.sendOnce(again, "weekly_digest", "c", content)).toBe("skipped");
  });
});

describe("EmailDigestService", () => {
  const recap = (over: Partial<Awaited<ReturnType<WeekSource["week"]>>> = {}) => ({
    from: "2026-10-04",
    to: "2026-10-10",
    games: 12,
    wins: 7,
    losses: 5,
    mmr: { exact: null, estimate: 75 },
    mostPlayed: { heroId: 14, games: 5, wins: 3 },
    best: { heroId: 26, games: 4, wins: 4 },
    ...over,
  });
  const history = (): PlayHistorySource => ({
    rankedSessions: async () => [],
    tiltStats: async () => ({
      baseline: { games: 0, wins: 0, rate: 0 },
      afterLosses: { 2: { games: 0, wins: 0, rate: 0 }, 3: { games: 0, wins: 0, rate: 0 } },
    }),
  });

  async function digestSetup(
    opts: {
      // Monday 2026-10-12 06:30 UTC is Monday afternoon in Manila.
      now?: Date;
      week?: ReturnType<typeof recap>;
      timeZone?: string | null;
      language?: string | null;
    } = {},
  ) {
    const now = opts.now ?? new Date("2026-10-12T06:30:00Z");
    const s = setup({ now: () => now });
    await confirmedUser(s);
    const week = vi.fn(async () => opts.week ?? recap());
    const digest = new EmailDigestService({
      email: s.service,
      users: {
        byIds: async (ids) =>
          ids.map((id) => ({
            id,
            accountId32: 1,
            language: opts.language ?? null,
            timeZone: opts.timeZone ?? null,
          })),
      },
      weeks: { week },
      history: history(),
      heroes: {
        names: async () =>
          new Map([
            [14, "Pudge"],
            [26, "Lion"],
          ]),
      },
      links,
      logger,
      now: () => now,
    });
    return { ...s, digest, week };
  }

  it("sends last week on Monday (Manila time by default), once", async () => {
    const { digest, mail, week } = await digestSetup();
    const before = mail.sent.length;
    const run = await digest.runDaily({ budgetMs: 10_000 });
    expect(run).toMatchObject({ users: 1, sent: 1, failed: 0 });
    expect(week).toHaveBeenCalledWith(
      { userId: "u1", accountId32: 1 },
      "Asia/Manila",
      "2026-10-05",
    );
    const email = mail.sent[before];
    expect(email.subject).toBe("Your Dota week: 7W 5L");
    expect(email.text).toContain("Ranked record: 7W 5L (58%)");
    expect(email.text).toContain("Most played: Pudge: 3W 2L");
    expect(email.text).toContain("Best hero: Lion: 4W 0L");
    expect(email.text).toContain("Open your dashboard: https://dota.example/dashboard");
    expect(email.text).toContain("Unsubscribe: https://dota.example/email/unsubscribe?token=");
    // The MMR estimate is never shown as a change.
    expect(email.text).not.toContain("MMR change:");
    expect(email.text).not.toMatch(/estimate|\+75/i);
    expect(email.text).toContain("Log your MMR before and after");
    expect((await digest.runDaily({ budgetMs: 10_000 })).sent).toBe(0);
  });

  it("shows an exact MMR change, in the player's language", async () => {
    const { digest, mail } = await digestSetup({
      week: recap({ mmr: { exact: -52, estimate: -40 } }),
      language: "ceb",
    });
    await digest.runDaily({ budgetMs: 10_000 });
    const email = mail.sent.at(-1)!;
    expect(email.subject).toBe("Imong semana sa Dota: 7W 5L");
    expect(email.text).toContain("Kausaban sa MMR: −52");
    expect(email.html).toContain('lang="ceb"');
  });

  it("skips weeks without games and days that aren't Monday where the player is", async () => {
    const none = await digestSetup({ week: recap({ games: 0, wins: 0, losses: 0 }) });
    const sent = none.mail.sent.length;
    expect((await none.digest.runDaily({ budgetMs: 10_000 })).sent).toBe(0);
    expect(none.mail.sent).toHaveLength(sent);
    // Still Sunday in Los Angeles.
    const la = await digestSetup({ timeZone: "America/Los_Angeles" });
    expect(await la.digest.runDaily({ budgetMs: 10_000 })).toMatchObject({ sent: 0, skipped: 1 });
    expect(la.week).not.toHaveBeenCalled();
  });

  it("adds one note only when the data supports it", async () => {
    const { digest } = await digestSetup();
    const week: DigestWeek = {
      from: "2026-10-04",
      to: "2026-10-10",
      games: 3,
      wins: 1,
      losses: 2,
      mmrExact: 10,
      mostPlayed: null,
      best: null,
    };
    const plain = digest.content("en", week, null, new Map(), { page: links.unsubscribe("t") });
    expect(plain.paragraphs).toEqual([]);
    const achievement = digest.content(
      "en",
      week,
      { kind: "achievement", id: "streak", n: 5 },
      new Map(),
      { page: links.unsubscribe("t") },
    );
    expect(achievement.paragraphs).toEqual([
      "New achievement last week: On a roll (Win 5 ranked games in a row).",
    ]);
    const tilt = digest.content(
      "en",
      week,
      {
        kind: "tilt",
        streak: 4,
        after: { games: 25, wins: 10, rate: 0.4 },
        baseline: { games: 300, wins: 156, rate: 0.52 },
      },
      new Map(),
      { page: links.unsubscribe("t") },
    );
    expect(tilt.paragraphs?.[0]).toContain("after 3 losses in a row you've won 40% of 25 games");
    expect(tilt.paragraphs?.[0]).toContain("against 52% overall");
  });

  it("does nothing when email is off", async () => {
    const s = setup({ sender: false });
    const digest = new EmailDigestService({
      email: s.service,
      users: { byIds: vi.fn() },
      weeks: { week: vi.fn() },
      history: history(),
      heroes: { names: vi.fn() },
      links,
      logger,
    });
    expect(await digest.runDaily({ budgetMs: 1000 })).toEqual({
      users: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      stoppedEarly: false,
    });
  });
});

describe("ResendEmailSender", () => {
  it("POSTs to /emails with the key, sender, both bodies and headers", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "re_123" }), { status: 200 }),
    );
    const sender = new ResendEmailSender({
      apiKey: "re_key",
      from: "Dota Den <digest@dota.example>",
      baseUrl: "http://localhost:9999/resend/",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const out = await sender.send({
      to: "p@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
      headers: { "List-Unsubscribe": "<https://x>" },
      idempotencyKey: "k",
    });
    expect(out).toEqual({ ok: true, id: "re_123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:9999/resend/emails");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer re_key");
    expect((init?.headers as Record<string, string>)["idempotency-key"]).toBe("k");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Dota Den <digest@dota.example>",
      to: ["p@example.com"],
      subject: "s",
      html: "<p>h</p>",
      text: "t",
      headers: { "List-Unsubscribe": "<https://x>" },
    });
  });

  it("reports provider errors and network failures", async () => {
    const failing = new ResendEmailSender({
      apiKey: "k",
      from: "a@b.co",
      fetch: (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch,
    });
    expect(await failing.send({ to: "p@example.com", subject: "", html: "", text: "" })).toEqual({
      ok: false,
      status: 422,
    });
    const down = new ResendEmailSender({
      apiKey: "k",
      from: "a@b.co",
      fetch: (async () => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch,
    });
    expect(await down.send({ to: "p@example.com", subject: "", html: "", text: "" })).toEqual({
      ok: false,
    });
  });
});

describe("email environment", () => {
  const base = { APP_URL: "http://localhost:3000", MONGODB_URI: "mongodb://localhost:27017" };

  it("needs RESEND_API_KEY and EMAIL_FROM together, with a valid sender", () => {
    expect(parseEnv(base).RESEND_API_KEY).toBeUndefined();
    const env = parseEnv({
      ...base,
      RESEND_API_KEY: "re_x",
      EMAIL_FROM: "Dota Den <digest@dota.example>",
      RESEND_API_BASE_URL: "http://localhost:3101/resend",
    });
    expect(env.EMAIL_FROM).toBe("Dota Den <digest@dota.example>");
    expect(
      parseEnv({ ...base, RESEND_API_KEY: "re_x", EMAIL_FROM: "digest@dota.example" }),
    ).toBeTruthy();
    expect(() => parseEnv({ ...base, RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
    expect(() => parseEnv({ ...base, EMAIL_FROM: "digest@dota.example" })).toThrow(/EMAIL_FROM/);
    expect(() =>
      parseEnv({ ...base, RESEND_API_KEY: "re_x", EMAIL_FROM: "not an address" }),
    ).toThrow(/EMAIL_FROM/);
    expect(() => parseEnv({ ...base, EMAIL_TOKEN_SECRET: "short" })).toThrow(/EMAIL_TOKEN_SECRET/);
  });
});
