"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "dd:notifications-prompt-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false; // Storage blocked: show it; dismissing then lasts until reload.
  }
}

/** Hidden on the server and where the browser can't show notifications at all. */
const shouldShow = () => !wasDismissed() && "Notification" in window;
const onStorage = (change: () => void) => {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
};

/** A one-line invitation on the overview; hidden for good once dismissed (this browser). */
export function NotificationsPrompt() {
  const t = useT();
  const wanted = useSyncExternalStore(onStorage, shouldShow, () => false);
  const [hidden, setHidden] = useState(false);

  if (!wanted || hidden) return null;
  return (
    <aside
      className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-3"
      aria-label={t("notifications.prompt.label")}
    >
      <p className="flex items-center gap-2 text-sm">
        <Bell aria-hidden className="size-4 text-gold" />
        {t("notifications.prompt.text")}
      </p>
      <div className="flex items-center gap-1">
        <Button asChild size="sm" variant="outline">
          <Link href="/account#notifications">{t("notifications.prompt.action")}</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("notifications.prompt.dismiss")}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              // Storage blocked: hidden until the next visit.
            }
          }}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
    </aside>
  );
}
