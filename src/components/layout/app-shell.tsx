import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { SteamIcon } from "@/components/icons/steam-icon";
import { InstallButton } from "@/components/pwa";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { getViewerTimeZone } from "@/common/http/request-context";
import { getT } from "@/common/i18n/server";
import { TimeZoneSync } from "@/modules/mmr/ui/time-zone-sync";
import { MobileTabBar, PublicNav, SidebarNav, type NavKey } from "./app-nav";
import { BrandMark } from "./brand-mark";
import { SiteFooter } from "./site-footer";

/** Sections that have shipped. Add a key here when its page lands. */
const ENABLED: readonly NavKey[] = [
  "overview",
  "matches",
  "heroes",
  "mmr",
  "sessions",
  "report",
  "together",
  "meta",
  "guides",
  "players",
  "patches",
  "draft",
  "live",
  "leaderboards",
  "account",
];

/** Admins also get the Admin page in their navigation. */
const navFor = (user: { roles: readonly string[] }): readonly NavKey[] =>
  user.roles.includes("admin") ? [...ENABLED, "admin"] : ENABLED;

async function Brand() {
  const t = await getT();
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={t("common.brand.home")}>
      <BrandMark className="size-8 drop-shadow-[0_0_12px_oklch(0.8_0.13_80/0.35)]" />
      <span className="font-display text-lg font-bold tracking-wider">
        Dota <span className="text-gold">Den</span>
      </span>
    </Link>
  );
}

async function SignOutButton({ className }: { className?: string }) {
  const t = await getT();
  return (
    <form action="/api/v1/auth/sign-out" method="post" className={className}>
      <Button type="submit" variant="ghost" size="icon" aria-label={t("common.auth.signOut")}>
        <LogOut className="size-4" />
      </Button>
    </form>
  );
}

async function SkipLink() {
  const t = await getT();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
    >
      {t("system.shell.skip")}
    </a>
  );
}

/**
 * Signed in: sidebar (desktop) or top bar + bottom tabs (mobile).
 * Guests: a simple top header. Same content area for both.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const user = await getCurrentUser({ tolerateErrors: true });

  if (!user) {
    return (
      <>
        <SkipLink />
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-4 sm:px-6">
            <Brand />
            <PublicNav enabled={ENABLED} />
            <Button asChild size="sm" className="ml-auto gap-2">
              {/* Full navigation, not client-side: the route redirects to Steam. */}
              <a href="/api/v1/auth/steam/login" aria-label={t("common.auth.signInSteam")}>
                <SteamIcon className="size-4" />
                <span className="hidden md:inline">{t("common.auth.signInSteam")}</span>
                <span className="md:hidden">{t("common.auth.signIn")}</span>
              </a>
            </Button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <SiteFooter />
        {/* Room for the bottom tab bar, below the footer so it never covers it. */}
        <div aria-hidden className="h-[calc(4.25rem+env(safe-area-inset-bottom))] sm:hidden" />
        <MobileTabBar enabled={ENABLED} signedIn={false} />
      </>
    );
  }

  const [profile, tz] = await Promise.all([
    matchesService.playerProfile(user.accountId32),
    getViewerTimeZone(),
  ]);
  const rank = parseRankTier(profile?.rankTier, profile?.leaderboardRank);
  const name = profile?.personaName ?? t("system.shell.player", { id: user.accountId32 });
  const avatar = (
    <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-gold/40">
      {profile?.avatarUrl && (
        <Image src={profile.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
      )}
    </span>
  );

  return (
    <>
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] bg-background/60 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground/70 uppercase">
            {t("system.shell.menu")}
          </p>
          <SidebarNav enabled={navFor(user)} />
        </div>
        <div className="space-y-3 border-t border-white/[0.06] p-4">
          <InstallButton className="w-full gap-2" />
          <div className="flex items-center gap-3">
            {avatar}
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{name}</div>
            <SignOutButton />
          </div>
          {rank ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1">
              <RankMedal rank={rank} size={40} />
              <span className="text-xs font-semibold text-gold">{rankLabel(rank)}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {t("system.shell.account", { id: user.accountId32 })}
            </div>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-background/75 px-4 backdrop-blur-xl lg:hidden">
        <Brand />
        <div className="ml-auto flex items-center gap-1">
          <InstallButton className="mr-1 h-8 gap-1.5 px-2 text-xs" />
          {avatar}
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:pl-64">
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12"
        >
          {children}
        </main>
        <SiteFooter />
        {/* Room for the bottom tab bar, below the footer so it never covers it. */}
        <div aria-hidden className="h-[calc(4.25rem+env(safe-area-inset-bottom))] lg:hidden" />
      </div>
      <MobileTabBar enabled={navFor(user)} signedIn />
      <TimeZoneSync current={tz.known ? tz.timeZone : null} />
    </>
  );
}
