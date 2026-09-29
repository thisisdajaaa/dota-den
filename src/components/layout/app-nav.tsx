"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  CalendarRange,
  History,
  LayoutDashboard,
  ScrollText,
  Swords,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

export type NavKey = "overview" | "matches" | "mmr" | "sessions" | "players" | "patches" | "draft";

const ITEMS: Array<{ key: NavKey; href: string; label: string; icon: LucideIcon; auth: boolean }> =
  [
    { key: "overview", href: "/dashboard", label: "Overview", icon: LayoutDashboard, auth: true },
    { key: "matches", href: "/matches", label: "Matches", icon: ScrollText, auth: true },
    { key: "mmr", href: "/mmr", label: "MMR journal", icon: CalendarRange, auth: true },
    { key: "sessions", href: "/sessions", label: "Sessions", icon: History, auth: true },
    { key: "players", href: "/players", label: "Players", icon: Users, auth: false },
    { key: "patches", href: "/patches", label: "Patches", icon: BookOpenText, auth: false },
    { key: "draft", href: "/draft", label: "Draft", icon: Swords, auth: false },
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

/** Fixed bottom tab bar for signed-in mobile users. */
export function MobileTabBar({ enabled }: { enabled: readonly NavKey[] }) {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {visible(enabled, true).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2 text-[0.65rem] font-medium",
                  active ? "text-gold" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                {label.split(" ")[0]}
              </Link>
            </li>
          );
        })}
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
