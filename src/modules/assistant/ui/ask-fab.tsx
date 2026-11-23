"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { BotMessageSquare, Loader2, Maximize2, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { apiRequest } from "@/common/http/api-client";
import { Button } from "@/components/ui/button";
import type { AskStateDto } from "../dtos/responses/ask.dto";
import { AskChat } from "./ask-chat";

/**
 * Ask Den from any page: a chat button in the lower right (above the tab bar on phones) that
 * opens the chat in a panel, full screen on phones. The chats load the first time it opens
 * and stay while the player moves between pages; it isn't shown on /ask itself.
 *
 * Non-modal, so the page behind stays usable on wide screens; Escape or the close button
 * closes it, and following a link from an answer does too. The panel stays mounted while
 * closed, so the conversation is still there when it reopens.
 */
export function AskFab({ plusOnSale }: { plusOnSale: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AskStateDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // A link followed from the panel (a match, a hero) goes to that page.
  const [shownOn, setShownOn] = useState(pathname);
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open || state) return;
    let live = true;
    apiRequest<AskStateDto>("/api/v1/ask")
      .then((s) => {
        if (!live) return;
        setState(s);
        setConversationId(s.conversationId);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, state, attempt]);

  if (pathname === "/ask" || pathname.startsWith("/ask/")) return null;

  const fullPage = conversationId ? `/ask?c=${encodeURIComponent(conversationId)}` : "/ask";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={open ? t("ask.fab.close") : t("ask.fab.open")}
          className={cn(
            "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-gold text-background shadow-lg ring-1 shadow-black/40 ring-gold/60 transition hover:brightness-110 focus-visible:ring-4 focus-visible:ring-gold/40 focus-visible:outline-none active:scale-95 lg:right-6 lg:bottom-6",
            // On phones the panel is full screen with its own close button.
            open && "max-sm:hidden",
          )}
        >
          {open ? (
            <X aria-hidden className="size-6" />
          ) : (
            <BotMessageSquare aria-hidden className="size-6" />
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal forceMount>
        <Dialog.Content
          // Kept mounted while closed, so a chat (even one mid-answer) is still there on reopening.
          forceMount
          aria-describedby={undefined}
          // Clicking the page behind doesn't close it; it's a side panel, not a popup.
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed inset-0 z-50 flex flex-col gap-3 bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] outline-none",
            "sm:inset-auto sm:right-4 sm:bottom-[calc(9.5rem+env(safe-area-inset-bottom))] sm:h-[min(40rem,calc(100dvh-14rem))] sm:w-[26rem] sm:rounded-2xl sm:border sm:border-white/[0.08] sm:bg-popover sm:shadow-2xl sm:shadow-black/50",
            "lg:right-6 lg:bottom-24 lg:h-[min(42rem,calc(100dvh-8rem))]",
            "data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4",
          )}
        >
          <div className="flex shrink-0 items-center gap-2">
            <Dialog.Title className="flex items-center gap-2 font-display text-base font-semibold tracking-wide">
              <BotMessageSquare aria-hidden className="size-4 text-gold" /> {t("ask.title")}
            </Dialog.Title>
            <div className="ml-auto flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href={fullPage}>
                  <Maximize2 aria-hidden className="size-4" />
                  <span className="sr-only sm:not-sr-only">{t("ask.fab.fullPage")}</span>
                </Link>
              </Button>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("ask.fab.close")}>
                  <X aria-hidden className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {state ? (
              state.enabled ? (
                <AskChat
                  variant="panel"
                  initialConversations={state.conversations}
                  initialConversationId={state.conversationId}
                  initialMessages={state.messages}
                  initialQuota={state.quota}
                  plusLimit={state.plusLimit}
                  plusOnSale={plusOnSale}
                  onConversation={setConversationId}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("ask.off")}</p>
              )
            ) : failed ? (
              <div className="space-y-2 text-sm" role="alert">
                <p className="text-loss">{t("ask.fab.failed")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((n) => n + 1);
                  }}
                >
                  {t("ask.fab.retry")}
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 aria-hidden className="size-4 animate-spin" /> {t("ask.fab.loading")}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
