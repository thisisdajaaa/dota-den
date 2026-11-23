"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BotMessageSquare,
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  SendHorizontal,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AskQuota } from "../domain/ask-quota";
import type { AskSource } from "../domain/ask-sources";
import type {
  AskConversationListItemDto,
  AskEventDto,
  AskMessageDto,
} from "../dtos/responses/ask.dto";
import type { AskToolName } from "../schemas/ask-tools.schema";

const STARTERS = ["lose", "build", "wards", "tilt", "meta", "last"] as const;
const MAX_QUESTION = 500;

/** Reads an NDJSON body line by line. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

/** The open chat in the address bar, so a reload or a shared tab reopens it. */
function rememberInUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Ask Den's chat (phone first): the player's conversations (start a new one, go back to an
 * older one, delete one), starter questions in the player's language, the tools being used
 * while Den works, and where each answer's data came from. The allowance left today is
 * always shown; when it's used up, Plus is offered once.
 */
export function AskChat({
  initialConversations,
  initialConversationId,
  initialMessages,
  initialQuota,
  plusLimit,
  plusOnSale,
  matchId,
  initialQuestion,
  variant = "page",
  onConversation,
}: {
  initialConversations: AskConversationListItemDto[];
  initialConversationId: string | null;
  initialMessages: AskMessageDto[];
  initialQuota: AskQuota;
  /** Questions a day with Plus (for the upsell). */
  plusLimit: number;
  plusOnSale: boolean;
  matchId?: string;
  initialQuestion?: string;
  /**
   * "page" is the /ask page (the open chat is kept in the address bar, chats listed beside it
   * on wide screens); "panel" is the chat button's panel, which fills its container, folds the
   * chats away at every size and leaves the address bar alone.
   */
  variant?: "page" | "panel";
  /** Told which chat is open (null for a new one), e.g. for the panel's full-page link. */
  onConversation?: (id: string | null) => void;
}) {
  const t = useT();
  const panel = variant === "panel";
  const remember = (id: string | null) => {
    if (!panel) rememberInUrl(id);
    onConversation?.(id);
  };
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [listOpen, setListOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [quota, setQuota] = useState(initialQuota);
  const [input, setInput] = useState(initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AskToolName | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The conversation's own scroll area (the page itself doesn't scroll to follow it). */
  const scroller = useRef<HTMLDivElement>(null);
  /** Whether the reader is at (or near) the newest message; reading back isn't interrupted. */
  const pinned = useRef(true);
  const lastTop = useRef(0);
  const shown = useRef(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Opening a chat jumps to its end; a new question or answer follows it smoothly, unless
    // you've scrolled up to read (your own question always brings you back down).
    const opened = shown.current === 0 || messages.length < shown.current;
    shown.current = messages.length;
    if (opened || pinned.current || busy) {
      el.scrollTo({ top: el.scrollHeight, behavior: opened ? "auto" : "smooth" });
      pinned.current = true;
    }
  }, [messages, busy, status]);

  // When the area around it changes (the question box swapped for the daily-limit note, the
  // chats folding open, a phone keyboard), stay at the newest message if you were there.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const keep = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    keep.observe(el);
    return () => keep.disconnect();
  }, []);

  const out = quota.remaining === 0;

  function errorText(reason: string | undefined, fallback?: string) {
    switch (reason) {
      case "resting":
        return t("ask.errors.resting");
      case "unavailable":
      case "not_configured":
        return t("ask.errors.unavailable");
      case "rate_limited":
        return t("ask.errors.rate");
      case "offline":
        return t("ask.errors.offline");
      default:
        return fallback ?? t("ask.errors.generic");
    }
  }

  async function send(question: string) {
    const text = question.trim().slice(0, MAX_QUESTION);
    if (!text || busy || out) return;
    setBusy(true);
    setProblem(null);
    setStatus(null);
    const pending: AskMessageDto = {
      role: "user",
      text,
      sources: [],
      fallback: false,
      at: new Date().toISOString(),
    };
    const before = messages;
    setMessages([...before, pending]);
    setInput("");
    try {
      const res = await fetch("/api/v1/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: text,
          ...(matchId ? { matchId } : {}),
          ...(conversationId ? { conversationId } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          code?: string;
          message?: string;
          details?: { reason?: string; quota?: AskQuota };
        } | null;
        setMessages(before);
        setInput(text);
        if (body?.details?.reason === "quota" && body.details.quota) {
          setQuota(body.details.quota);
          return;
        }
        setProblem(errorText(body?.details?.reason ?? body?.code ?? undefined, body?.message));
        return;
      }
      let done = false;
      for await (const line of lines(res.body)) {
        let event: AskEventDto;
        try {
          event = JSON.parse(line) as AskEventDto;
        } catch {
          continue;
        }
        if (event.type === "status") setStatus(event.tool);
        else if (event.type === "answer") {
          done = true;
          setMessages([...before, event.data.question, event.data.answer]);
          setQuota(event.data.quota);
          const c = event.data.conversation;
          if (c) {
            setConversationId(c.id);
            remember(c.id);
            setConversations((list) => {
              const prev = list.find((x) => x.id === c.id);
              const item: AskConversationListItemDto = {
                id: c.id,
                title: c.title ?? prev?.title ?? text,
                updatedAt: c.updatedAt,
                messages: (prev?.messages ?? 0) + 2,
              };
              return [item, ...list.filter((x) => x.id !== c.id)];
            });
          }
        } else if (event.type === "error") {
          done = true;
          if (event.reason === "conversation_not_found") {
            // Deleted elsewhere: start over in a new chat, keeping the question to resend.
            forget(conversationId);
            startNew();
            setInput(text);
            setProblem(t("ask.conversations.gone"));
            continue;
          }
          setMessages(before);
          setInput(text);
          setProblem(errorText(event.reason, event.message));
        }
      }
      if (!done) {
        setMessages(before);
        setInput(text);
        setProblem(t("ask.errors.generic"));
      }
    } catch {
      setMessages(before);
      setInput(text);
      setProblem(t("ask.errors.offline"));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function forget(id: string | null) {
    if (id) setConversations((list) => list.filter((x) => x.id !== id));
  }

  function startNew() {
    setConversationId(null);
    setMessages([]);
    setProblem(null);
    setListOpen(false);
    remember(null);
  }

  async function open(id: string) {
    if (busy || loading) return;
    if (id === conversationId) return setListOpen(false);
    setLoading(true);
    setProblem(null);
    try {
      const res = await apiRequest<{ conversationId: string; messages: AskMessageDto[] }>(
        `/api/v1/ask?c=${encodeURIComponent(id)}`,
      );
      setConversationId(res.conversationId);
      setMessages(res.messages);
      setListOpen(false);
      remember(res.conversationId);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 404) {
        forget(id);
        setProblem(t("ask.conversations.gone"));
      } else setProblem(t("ask.conversations.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    try {
      await apiRequest(`/api/v1/ask?c=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (e) {
      if (!(e instanceof ApiClientError && e.status === 404)) {
        setProblem(e instanceof ApiClientError ? e.message : t("ask.errors.offline"));
        return;
      }
    }
    forget(id);
    if (id === conversationId) startNew();
  }

  const list = (
    <nav aria-label={t("ask.conversations.label")} className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={startNew}
        disabled={busy}
      >
        <MessageSquarePlus aria-hidden className="size-4" /> {t("ask.conversations.newChat")}
      </Button>
      {conversations.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{t("ask.conversations.empty")}</p>
      ) : (
        <ul className="max-h-[30dvh] space-y-0.5 overflow-y-auto overscroll-contain pr-1 lg:max-h-[calc(100dvh-11rem)]">
          {conversations.map((c) => {
            const current = c.id === conversationId;
            return (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void open(c.id)}
                  aria-current={current ? "true" : undefined}
                  aria-label={t("ask.conversations.open", { title: c.title })}
                  disabled={busy || loading}
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[0.05]",
                    current && "bg-gold/10 text-gold",
                  )}
                >
                  <span className="line-clamp-1">{c.title}</span>
                  <span className="block text-[0.7rem] text-muted-foreground tabular-nums">
                    {new Date(c.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  disabled={busy}
                  aria-label={t("ask.conversations.deleteNamed", { title: c.title })}
                  className="rounded-md p-1.5 text-muted-foreground opacity-70 group-hover:opacity-100 hover:bg-white/[0.05] hover:text-loss focus-visible:opacity-100"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );

  return (
    <div
      className={
        panel ? "flex h-full min-h-0 flex-col" : "grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]"
      }
    >
      {!panel && <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">{list}</aside>}
      <section
        aria-labelledby={panel ? undefined : "ask-chat"}
        aria-label={panel ? t("ask.title") : undefined}
        // The chat fits the screen (or the panel): messages scroll inside it, the question box
        // stays in view.
        className={cn(
          "flex min-w-0 flex-col gap-3",
          panel
            ? "h-full min-h-0 flex-1"
            : "panel h-[calc(100dvh-22rem)] max-h-[60rem] min-h-[24rem] p-4 sm:p-5 lg:h-[calc(100dvh-16rem)]",
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          {!panel && (
            <h2 id="ask-chat" className="flex items-center gap-2 text-base font-semibold">
              <BotMessageSquare aria-hidden className="size-4 text-gold" /> {t("ask.den")}
            </h2>
          )}
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {plural(t, "ask.quota.left", quota.remaining)}
            </p>
            {conversationId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(conversationId)}
                disabled={busy}
              >
                <Trash2 aria-hidden className="size-4" /> {t("ask.conversations.delete")}
              </Button>
            )}
          </div>
        </div>

        {/* Phones and tablets: the chats fold away above the conversation. */}
        <div className={cn("shrink-0 space-y-2", !panel && "lg:hidden")}>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-expanded={listOpen}
              onClick={() => setListOpen((o) => !o)}
            >
              <ChevronDown
                aria-hidden
                className={cn("size-4 transition-transform", listOpen && "rotate-180")}
              />
              {listOpen
                ? t("ask.conversations.hide")
                : t("ask.conversations.show", { n: conversations.length })}
            </Button>
            {!listOpen && (
              <Button variant="outline" size="sm" onClick={startNew} disabled={busy}>
                <MessageSquarePlus aria-hidden className="size-4" />{" "}
                {t("ask.conversations.newChat")}
              </Button>
            )}
          </div>
          {listOpen && list}
        </div>

        {matchId && (
          <p className="shrink-0 rounded-md bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground">
            {t("ask.match.context", { id: matchId })}
          </p>
        )}

        <div
          ref={scroller}
          data-testid="ask-scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            // Only scrolling up lets go of the newest message: a smooth scroll down passes
            // through "not at the end" on its way there and must not count as reading back.
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) pinned.current = true;
            else if (el.scrollTop < lastTop.current) pinned.current = false;
            lastTop.current = el.scrollTop;
          }}
          className="relative -mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-2"
        >
          <div role="log" aria-label={t("ask.title")} className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <Message key={`${m.at}-${i}`} message={m} />
            ))}
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 aria-hidden className="size-4 animate-spin" />
              </p>
            )}
            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {status ? t(`ask.status.${status}`) : t("ask.thinking")}
              </p>
            )}
          </div>

          {messages.length === 0 && !busy && !loading && !out && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("ask.starters.title")}</p>
              <ul className="flex flex-wrap gap-2">
                {STARTERS.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => send(t(`ask.starters.${key}`))}
                      className="rounded-full border border-white/[0.08] px-3 py-1.5 text-left text-sm hover:border-gold/40 hover:text-gold"
                    >
                      {t(`ask.starters.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {problem && (
            <p role="alert" className="text-sm text-loss">
              {problem}
            </p>
          )}
        </div>

        {out ? (
          <div className="shrink-0 space-y-1.5 rounded-lg border border-gold/25 bg-gold/[0.06] p-3 text-sm">
            <p className="font-medium">{t("ask.out.title")}</p>
            <p className="text-muted-foreground">
              {quota.plus
                ? t("ask.out.plus", { n: quota.limit })
                : t("ask.out.free", { free: quota.limit, plus: plusLimit })}{" "}
              {!quota.plus && t("ask.quota.resets")}
            </p>
            {!quota.plus && plusOnSale && (
              <Link href="/plus" className="inline-block font-medium text-gold hover:underline">
                {t("ask.out.seePlus")}
              </Link>
            )}
          </div>
        ) : (
          <form
            className="flex shrink-0 items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Textarea
              aria-label={t("ask.inputLabel")}
              placeholder={t("ask.placeholder")}
              value={input}
              maxLength={MAX_QUESTION}
              rows={2}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              className="min-h-11 flex-1 resize-none text-base sm:text-sm"
            />
            <Button type="submit" disabled={busy || !input.trim()} aria-label={t("ask.send")}>
              {busy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <SendHorizontal aria-hidden className="size-4" />
              )}
              <span className="sr-only sm:not-sr-only">{t("ask.send")}</span>
            </Button>
          </form>
        )}
        <p className="shrink-0 text-xs text-muted-foreground">{t("ask.disclaimer")}</p>
      </section>
    </div>
  );
}

function Message({ message }: { message: AskMessageDto }) {
  const t = useT();
  const mine = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      <p className="sr-only">{mine ? t("ask.you") : t("ask.den")}</p>
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap sm:max-w-[80%]",
          mine ? "rounded-br-sm bg-gold/15" : "rounded-bl-sm bg-white/[0.05]",
        )}
      >
        {message.fallback ? (
          <span className="text-muted-foreground">{t("ask.fallback")}</span>
        ) : (
          message.text
        )}
      </div>
      {!mine && message.sources.length > 0 && <SourceChips sources={message.sources} />}
    </div>
  );
}

export function SourceChips({ sources }: { sources: readonly AskSource[] }) {
  const t = useT();
  const label = (s: AskSource) => {
    switch (s.kind) {
      case "your_games":
        return plural(t, "ask.sources.your_games", s.games);
      case "your_parsed_games":
        return plural(t, "ask.sources.your_parsed_games", s.games);
      case "your_match":
        return t("ask.sources.your_match");
      case "your_sessions":
        return t("ask.sources.your_sessions");
      case "your_mmr":
        return t("ask.sources.your_mmr");
      case "high_rank_pubs":
        return t("ask.sources.high_rank_pubs");
      case "pro_games":
        return t("ask.sources.pro_games");
      case "patch_notes":
        return t("ask.sources.patch_notes", { version: s.version });
      case "bracket_pubs":
        return t("ask.sources.bracket_pubs", { bracket: s.bracket });
    }
  };
  return (
    <ul aria-label={t("ask.sources.label")} className="flex max-w-[92%] flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <li
          key={i}
          className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[0.7rem] text-muted-foreground"
        >
          {label(s)}
        </li>
      ))}
    </ul>
  );
}
