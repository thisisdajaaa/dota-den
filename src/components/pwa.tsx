"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the service worker (offline page only). Production builds only. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/**
 * "Install app", shown only where the browser offers one-click install (Chrome, Edge,
 * Android). Safari users add it from the Share menu instead.
 */
export function InstallButton({ className }: { className?: string }) {
  const t = useT();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!prompt) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice.catch(() => null);
        setPrompt(null);
      }}
    >
      <Download aria-hidden className="size-4" />
      {t("system.pwa.install")}
    </Button>
  );
}
