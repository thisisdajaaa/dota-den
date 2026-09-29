import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity/composition";
import { getPlayerProfile } from "@/modules/matches/composition";
import { SteamIcon } from "@/components/icons/steam-icon";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";

export async function SiteHeader() {
  const user = await getCurrentUser({ tolerateErrors: true });
  const profile = user ? await getPlayerProfile(user.accountId32) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Dota Den home">
          <BrandMark className="size-8 drop-shadow-[0_0_12px_oklch(0.8_0.13_80/0.35)]" />
          <span className="font-display text-lg font-bold tracking-wider">
            Dota <span className="text-gold">Den</span>
          </span>
        </Link>
        {user && (
          <nav aria-label="Main" className="hidden items-center gap-6 sm:flex">
            <NavLink href="/dashboard">Dashboard</NavLink>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-card/60 py-1 pr-3 pl-1 text-sm transition-colors hover:border-gold/40"
              >
                <span className="relative size-7 overflow-hidden rounded-full bg-muted ring-1 ring-gold/40">
                  {profile?.avatarUrl && (
                    <Image
                      src={profile.avatarUrl}
                      alt=""
                      fill
                      sizes="28px"
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="max-w-32 truncate font-medium">
                  {profile?.personaName ?? "Your den"}
                </span>
              </Link>
              <form action="/api/v1/auth/sign-out" method="post">
                <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm" className="gap-2">
              {/* Full navigation, not client-side: the route redirects to Steam. */}
              <a href="/api/v1/auth/steam/login">
                <SteamIcon className="size-4" />
                Sign in through Steam
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
