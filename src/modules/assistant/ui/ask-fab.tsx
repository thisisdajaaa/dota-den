"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BotMessageSquare, Loader2, Maximize2, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { apiRequest } from "@/common/http/api-client";
import { Button } from "@/components/ui/button";
import type { AskStateDto } from "../dtos/responses/ask.dto";
import { AskChat, type ChatPerson } from "./ask-chat";

/**
 * Ask Den from any page: a chat button in the lower right (above the tab bar on phones) that
 * opens the chat in a panel, full screen on phones. The chats load the first time it opens
 * and stay while the player moves between pages; it isn't shown on /ask itself.
 *
 * Non-modal, so the page behind stays usable on wide screens; Escape or the close button
 * closes it, and following a link from an answer does too. A plain panel rather than a Radix
 * dialog: kept mounted while closed, Radix's focus guards would stay in the tab order. The panel stays mounted while
 * closed, so the conversation is still there when it reopens.
 */
export function AskFab({ plusOnSale, me }: { plusOnSale: boolean; me?: ChatPerson }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AskStateDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  // Opening moves focus into the panel (closing moves it back to the button).
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

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

  const close = () => {
    setOpen(false);
    fab.current?.focus();
  };

  return (
    <>
      <button
        ref={fab}
        type="button"
        aria-label={open ? t("ask.fab.close") : t("ask.fab.open")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
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
      <div
        ref={panel}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-state={open ? "open" : "closed"}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
        className={cn(
          "fixed inset-0 z-50 flex-col gap-3 bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] outline-none",
          "sm:inset-auto sm:right-4 sm:bottom-[calc(9.5rem+env(safe-area-inset-bottom))] sm:h-[min(40rem,calc(100dvh-14rem))] sm:w-[26rem] sm:rounded-2xl sm:border sm:border-white/[0.08] sm:bg-popover sm:shadow-2xl sm:shadow-black/50",
          "lg:right-6 lg:bottom-24 lg:h-[min(42rem,calc(100dvh-8rem))]",
          // Hidden, not unmounted, while closed: nothing in it can take focus, and the chat
          // (even one mid-answer) is still there on reopening.
          open ? "flex animate-in fade-in-0 slide-in-from-bottom-4" : "hidden",
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
          <h2
            id={titleId}
            className="flex items-center gap-2 font-display text-base font-semibold tracking-wide"
          >
            <BotMessageSquare aria-hidden className="size-4 text-gold" /> {t("ask.title")}
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={fullPage}>
                <Maximize2 aria-hidden className="size-4" />
                <span className="sr-only sm:not-sr-only">{t("ask.fab.fullPage")}</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("ask.fab.close")} onClick={close}>
              <X aria-hidden className="size-4" />
            </Button>
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
                me={me}
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
      </div>
    </>
  );
}
