import "server-only";
import { NextResponse } from "next/server";
import { NotFoundError, UnauthorizedError } from "@/common/errors/app-error";
import { handler, toNextResponse } from "@/common/http/controller";
import { requestId } from "@/common/http/http";
import { ServiceResponse } from "@/common/http/service-response";
import type { Logger } from "@/common/logging/logger";
import { isLocale, LOCALE_COOKIE } from "@/common/i18n/locales";
import {
  optionalUser,
  requireUser,
  SESSION_COOKIE,
  sessionCookieOptions,
  STATE_COOKIE,
} from "./identity.guards";
import { LanguageSchema } from "./schemas/language.schema";
import { VisibilitySchema } from "./schemas/visibility.schema";
import type { AuthService } from "./services/auth.service";
import type { UsersService } from "./services/users.service";

const STATE_COOKIE_PATH = "/api/v1/auth/steam";

export class IdentityController {
  constructor(
    private readonly deps: {
      auth: AuthService;
      /** Test mode only: `?as=<SteamID64>` signs in as that fake identity. */
      authAs: (testSteamId: string | undefined) => AuthService;
      users: UsersService;
      appUrl: () => string;
      secureCookies: () => boolean;
      logger: Pick<Logger, "info" | "warn">;
    },
  ) {}

  /** GET /api/v1/auth/steam/login: off to Steam, with a state cookie. */
  login = handler({}, async ({ req }) => {
    const as = req.nextUrl.searchParams.get("as");
    const auth = this.deps.authAs(as && /^\d{17}$/.test(as) ? as : undefined);
    const { redirectUrl, state } = auth.beginSignIn();
    const res = NextResponse.redirect(redirectUrl, 302);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.deps.secureCookies(),
      path: STATE_COOKIE_PATH,
      maxAge: 10 * 60,
    });
    return res;
  });

  /** GET /api/v1/auth/steam/callback: verify with Steam, start a session. */
  callback = handler({}, async ({ req }) => {
    const result = await this.deps.auth.completeSignIn({
      params: req.nextUrl.searchParams,
      cookieState: req.cookies.get(STATE_COOKIE)?.value,
    });
    const appUrl = this.deps.appUrl();
    if (!result.ok) {
      this.deps.logger.warn("steam_sign_in_rejected", {
        requestId: requestId(req),
        reason: result.error.type,
      });
      const res = NextResponse.redirect(new URL(`/?auth_error=${result.error.type}`, appUrl), 303);
      res.cookies.delete({ name: STATE_COOKIE, path: STATE_COOKIE_PATH });
      return res;
    }
    this.deps.logger.info("steam_sign_in_succeeded", {
      requestId: requestId(req),
      userId: result.value.user.id,
    });
    const res = NextResponse.redirect(new URL("/dashboard", appUrl), 303);
    res.cookies.delete({ name: STATE_COOKIE, path: STATE_COOKIE_PATH });
    res.cookies.set(
      SESSION_COOKIE,
      result.value.session.token,
      sessionCookieOptions(result.value.session.expiresAt),
    );
    // A language chosen on another device follows the account.
    const language = result.value.user.settings.language;
    if (isLocale(language)) res.cookies.set(LOCALE_COOKIE, language, this.languageCookie());
    return res;
  });

  /** POST /api/v1/auth/sign-out: ends this session (Steam keeps its own sign-in). */
  signOut = handler({}, async ({ req }) => {
    await this.deps.auth.signOut(req.cookies.get(SESSION_COOKIE)?.value);
    const res = NextResponse.redirect(new URL("/?bye=1", this.deps.appUrl()), 303);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  });

  /** GET /api/v1/me: who's signed in; rotates the session token when it's due. */
  me = handler({}, async ({ req }) => {
    const resolved = await this.deps.auth.resolveSession(req.cookies.get(SESSION_COOKIE)?.value, {
      rotate: true,
    });
    if (!resolved) throw new UnauthorizedError();
    const { user, rotated } = resolved;
    const res = toNextResponse(
      ServiceResponse.success({
        id: user.id,
        steamId64: user.steamId64,
        accountId32: user.accountId32,
        persona: user.persona,
        settings: user.settings,
        isAdmin: user.roles.includes("admin"),
      }).withHeaders({ "cache-control": "private, no-store" }),
    );
    if (rotated)
      res.cookies.set(SESSION_COOKIE, rotated.token, sessionCookieOptions(rotated.expiresAt));
    return res;
  });

  /**
   * PUT /api/v1/me/settings/language: the UI language. Remembered in a cookie on this device
   * and, when signed in, on the account (so it follows you to other devices).
   */
  setLanguage = handler(
    {
      guard: optionalUser,
      rateLimit: { name: "language", limit: 30, windowMs: 60_000 },
      body: LanguageSchema,
    },
    async ({ user, body }) => {
      if (user) await this.deps.users.setLanguage(user.id, body.language);
      const res = toNextResponse(
        ServiceResponse.success({ language: body.language }, "Language saved"),
      );
      res.cookies.set(LOCALE_COOKIE, body.language, this.languageCookie());
      return res;
    },
  );

  private languageCookie() {
    return {
      sameSite: "lax" as const,
      secure: this.deps.secureCookies(),
      path: "/",
      maxAge: 365 * 24 * 3600,
    };
  }

  /**
   * PUT /api/v1/me/settings/visibility: who can see your profile and activity. Private by
   * default (spec §5); "public" also lists you on the Everyone leaderboards.
   */
  setVisibility = handler(
    {
      guard: requireUser,
      rateLimit: { name: "visibility", limit: 20, windowMs: 60_000 },
      body: VisibilitySchema,
    },
    async ({ user, body }) => {
      const saved = await this.deps.users.setProfileVisibility(user.id, body.profileVisibility);
      if (!saved) throw new NotFoundError("Account not found");
      return ServiceResponse.success(
        { profileVisibility: body.profileVisibility },
        "Visibility saved",
      );
    },
  );
}
