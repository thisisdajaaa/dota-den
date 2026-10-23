"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/common/i18n/client";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import {
  BookOpenText,
  CalendarRange,
  Ellipsis,
  FileChartColumn,
  GraduationCap,
  Handshake,
  History,
  LayoutDashboard,
  Radio,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  UserCog,
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
  | "report"
  | "together"
  | "groups"
  | "meta"
  | "guides"
  | "players"
  | "patches"
  | "draft"
  | "leaderboards"
  | "live"
  | "account"
  | "plus"
  | "admin";

/** Sidebar sections, in order; Settings (account, admin) always comes last. */
type NavGroup = "you" | "community" | "tools" | "settings";
const GROUPS: readonly NavGroup[] = ["you", "community", "tools", "settings"];

type NavItem = { key: NavKey; href: string; icon: LucideIcon; auth: boolean; group: NavGroup };

const ITEMS: NavItem[] = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard, auth: true, group: "you" },
  { key: "matches", href: "/matches", icon: ScrollText, auth: true, group: "you" },
  { key: "heroes", href: "/heroes", icon: Shield, auth: true, group: "you" },
  { key: "mmr", href: "/mmr", icon: CalendarRange, auth: true, group: "you" },
  { key: "sessions", href: "/sessions", icon: History, auth: true, group: "you" },
  { key: "report", href: "/report", icon: FileChartColumn, auth: true, group: "you" },
  { key: "together", href: "/together", icon: UsersRound, auth: true, group: "community" },
  { key: "groups", href: "/groups", icon: Handshake, auth: true, group: "community" },
  { key: "meta", href: "/meta", icon: TrendingUp, auth: false, group: "tools" },
  { key: "guides", href: "/guides", icon: GraduationCap, auth: false, group: "tools" },
  { key: "players", href: "/players", icon: Users, auth: false, group: "community" },
  { key: "patches", href: "/patches", icon: BookOpenText, auth: false, group: "tools" },
  { key: "draft", href: "/draft", icon: Swords, auth: false, group: "tools" },
  { key: "live", href: "/live", icon: Radio, auth: false, group: "tools" },
  { key: "leaderboards", href: "/leaderboards", icon: Trophy, auth: true, group: "community" },
  { key: "account", href: "/account", icon: UserCog, auth: true, group: "settings" },
  // Only listed while Plus is on sale (ADR 0013).
  { key: "plus", href: "/plus", icon: Sparkles, auth: true, group: "settings" },
  { key: "admin", href: "/admin", icon: ShieldCheck, auth: true, group: "settings" },
];

function useActive(): (href: string) => boolean {
  const pathname = usePathname();
  return (href) => pathname === href || pathname.startsWith(`${href}/`);
}

function visible(enabled: readonly NavKey[], signedIn: boolean, t: Translator<Messages>) {
  return ITEMS.filter((i) => enabled.includes(i.key) && (signedIn || !i.auth)).map((i) => ({
    ...i,
    label: t(`common.nav.${i.key}`),
  }));
}

/**
 * Vertical nav for the desktop sidebar, in labelled sections (You, Community, Tools, then
 * Settings). Compact rows so every item fits a 900px-tall window; the sidebar scrolls below that.
 */
export function SidebarNav({ enabled }: { enabled: readonly NavKey[] }) {
  const t = useT();
  const isActive = useActive();
  const items = visible(enabled, true, t);
  return (
    <nav aria-label={t("common.nav.main")} className="flex flex-col gap-3">
      {GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        const labelId = `nav-group-${group}`;
        return (
          <div
            key={group}
            role="group"
            aria-labelledby={labelId}
            className={cn(
              "flex flex-col gap-0.5",
              group === "settings" && "border-t border-white/[0.06] pt-3",
            )}
          >
            <p
              id={labelId}
              className="px-3 pb-1 text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground/70 uppercase"
            >
              {t(`common.nav.sections.${group}`)}
            </p>
            {groupItems.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
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
          </div>
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
  const t = useT();
  const isActive = useActive();
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  // Close the sheet on navigation: it's only open for the path it was opened on.
  const moreOpen = open === pathname;
  const items = visible(enabled, signedIn, t);
  // Guests only have the public sections, which all fit without a "More" sheet.
  const primary = signedIn ? items.filter((i) => MOBILE_PRIMARY.includes(i.key)) : items;
  const more = signedIn ? items.filter((i) => !MOBILE_PRIMARY.includes(i.key)) : [];
  const moreActive = more.some((i) => isActive(i.href));
  // Each tab takes an equal share of the bar, so the whole width is tappable.
  const tab =
    "flex w-full min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-center text-[0.65rem] font-medium";

  return (
    <nav
      aria-label={t("common.nav.main")}
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
      <ul className="mx-auto flex max-w-md">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(tab, active ? "text-gold" : "text-muted-foreground")}
              >
                <Icon aria-hidden className="size-5" />
                {/* The whole name: a first word alone is just "Mga" in Filipino. */}
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li className="min-w-0 flex-1">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-nav"
              onClick={() => setOpen(moreOpen ? null : pathname)}
              className={cn(tab, moreActive || moreOpen ? "text-gold" : "text-muted-foreground")}
            >
              <Ellipsis aria-hidden className="size-5" />
              <span className="max-w-full truncate">{t("common.nav.more")}</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** Horizontal links for the guest header. */
export function PublicNav({ enabled }: { enabled: readonly NavKey[] }) {
  const t = useT();
  const isActive = useActive();
  return (
    <nav aria-label={t("common.nav.main")} className="hidden items-center gap-4 sm:flex lg:gap-6">
      {visible(enabled, false, t).map(({ href, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-sm whitespace-nowrap transition-colors",
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
