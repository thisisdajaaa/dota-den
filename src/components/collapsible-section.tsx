"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

const PREFIX = "dd:collapsed:";

function read(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === "1";
  } catch {
    return false;
  }
}
function write(key: string, collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(PREFIX + key, "1");
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}
const onStorage = (change: () => void) => {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
};

/**
 * A group of cards the player can fold away, remembered per browser. Open by default (and on
 * the server), so nothing is hidden until someone chooses to hide it. A link to something
 * inside (e.g. `#goals-title`) opens it again.
 */
export function CollapsibleSection({
  storageKey,
  title,
  children,
  className,
}: {
  /** Remembers the choice under this key. */
  storageKey: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const stored = useSyncExternalStore(
    onStorage,
    () => read(storageKey),
    () => false,
  );
  // This tab's choice wins over storage (which may be blocked).
  const [local, setLocal] = useState<boolean | null>(null);
  const collapsed = local ?? stored;

  useEffect(() => {
    const openFor = (hash: string) => {
      if (!hash) return;
      const target = document.getElementById(decodeURIComponent(hash));
      if (target && document.getElementById(id)?.contains(target)) {
        setLocal(false);
        requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      }
    };
    const onHash = () => openFor(window.location.hash.slice(1));
    // In-app links change the hash with pushState, which fires no hashchange: watch clicks too.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href*='#']");
      if (a instanceof HTMLAnchorElement && a.pathname === window.location.pathname) {
        openFor(a.hash.slice(1));
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick, true);
    };
  }, [id]);

  const toggle = () => {
    const next = !collapsed;
    setLocal(next);
    write(storageKey, next);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={id}
        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-1 text-left text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span>{title}</span>
        <span aria-hidden className="h-px flex-1 bg-white/[0.06]" />
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", collapsed && "-rotate-90")}
        />
      </button>
      <div id={id} hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
