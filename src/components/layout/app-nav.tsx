"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpenText,
  CalendarRange,
  Ellipsis,
  GraduationCap,
  History,
  LayoutDashboard,
  Radio,
  ScrollText,
  Shield,
  ShieldCheck,
  Swords,
  TrendingUp,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

export type NavKey =
  | "overview"
  | "matches"
  | "heroes"
  | "mmr"
  | "sessions"
  | "together"
  | "meta"
  | "guides"
  | "players"
  | "patches"
  | "draft"
  | "leaderboards"
  | "live"
  | "admin";

const ITEMS: Array<{ key: NavKey; href: string; label: string; icon: LucideIcon; auth: boolean }> =
  [
    { key: "overview", href: "/dashboard", label: "Overview", icon: LayoutDashboard, auth: true },
    { key: "matches", href: "/matches", label: "Matches", icon: ScrollText, auth: true },
    { key: "heroes", href: "/heroes", label: "Heroes", icon: Shield, auth: true },
    { key: "mmr", href: "/mmr", label: "MMR journal", icon: CalendarRange, auth: true },
    { key: "sessions", href: "/sessions", label: "Sessions", icon: History, auth: true },
    { key: "together", href: "/together", label: "Together", icon: UsersRound, auth: true },
    { key: "meta", href: "/meta", label: "Meta", icon: TrendingUp, auth: false },
    { key: "guides", href: "/guides", label: "Guides", icon: GraduationCap, auth: false },
    { key: "players", href: "/players", label: "Players", icon: Users, auth: false },
    { key: "patches", href: "/patches", label: "Patches", icon: BookOpenText, auth: false },
    { key: "draft", href: "/draft", label: "Draft", icon: Swords, auth: false },
    { key: "live", href: "/live", label: "Live", icon: Radio, auth: false },
    { key: "admin", href: "/admin", label: "Admin", icon: ShieldCheck, auth: true },
    {
      key: "leaderboards",
      href: "/leaderboards",
      label: "Leaderboards",
      icon: Trophy,
      auth: true,
    },
  ];

function useActive(): (href: string) => boolean {
  const pathname = usePathname();
  return (href) => pathname === href || pathname.startsWith(`${href}/`);
}

function visible(enabled: readonly NavKey[], signedIn: boolean) {
  return ITEMS.filter((i) => enabled.includes(i.key) && (signedIn || !i.auth));
}

/** Vertical nav for the desktop sidebar. */
export function SidebarNav({ enabled }: { enabled: readonly NavKey[] }) {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {visible(enabled, true).map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-gradient-to-r from-gold/15 to-transparent text-foreground"
                : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold"
              />
            )}
            <Icon
              aria-hidden
              className={cn(
                "size-4",
                active ? "text-gold" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Tabs that always show on the mobile bar; the rest go under "More". */
const MOBILE_PRIMARY: readonly NavKey[] = ["overview", "matches", "draft", "meta"];

/** Fixed bottom tab bar on phones (signed-in: main tabs plus "More"; guests: the public pages). */
export function MobileTabBar({
  enabled,
  signedIn,
}: {
  enabled: readonly NavKey[];
  signedIn: boolean;
}) {
  const isActive = useActive();
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  // Close the sheet on navigation: it's only open for the path it was opened on.
  const moreOpen = open === pathname;
  const items = visible(enabled, signedIn);
  // Guests only have the public sections, which all fit without a "More" sheet.
  const primary = signedIn ? items.filter((i) => MOBILE_PRIMARY.includes(i.key)) : items;
  const more = signedIn ? items.filter((i) => !MOBILE_PRIMARY.includes(i.key)) : [];
  const moreActive = more.some((i) => isActive(i.href));
  const tab = "flex flex-col items-center gap-0.5 px-2 py-2 text-[0.65rem] font-medium";

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl",
        // Guests get the header links from sm up; signed-in users get the sidebar from lg.
        signedIn ? "lg:hidden" : "sm:hidden",
      )}
    >
      {moreOpen && (
        <ul
          id="more-nav"
          className="mx-auto grid max-w-md grid-cols-3 gap-1 border-b border-white/[0.06] p-2"
        >
          {more.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(null)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium",
                    active ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-white/[0.04]",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="mx-auto flex max-w-md justify-around">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(tab, active ? "text-gold" : "text-muted-foreground")}
              >
                <Icon aria-hidden className="size-5" />
                {label.split(" ")[0]}
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-nav"
              onClick={() => setOpen(moreOpen ? null : pathname)}
              className={cn(tab, moreActive || moreOpen ? "text-gold" : "text-muted-foreground")}
            >
              <Ellipsis aria-hidden className="size-5" />
              More
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** Horizontal links for the guest header. */
export function PublicNav({ enabled }: { enabled: readonly NavKey[] }) {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="hidden items-center gap-6 sm:flex">
      {visible(enabled, false).map(({ href, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-sm transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
