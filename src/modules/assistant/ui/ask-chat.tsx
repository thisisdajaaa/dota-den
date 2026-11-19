"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BotMessageSquare, Loader2, SendHorizontal, Trash2 } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AskQuota } from "../domain/ask-quota";
import type { AskSource } from "../domain/ask-sources";
import type { AskEventDto, AskMessageDto } from "../dtos/responses/ask.dto";
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

/**
 * Ask Den's chat (phone first): the remembered conversation, starter questions in the
 * player's language, the tools being used while Den works, and where each answer's data came
 * from. The allowance left today is always shown; when it's used up, Plus is offered once.
 */
export function AskChat({
  initialMessages,
  initialQuota,
  plusLimit,
  plusOnSale,
  matchId,
  initialQuestion,
}: {
  initialMessages: AskMessageDto[];
  initialQuota: AskQuota;
  /** Questions a day with Plus (for the upsell). */
  plusLimit: number;
  plusOnSale: boolean;
  matchId?: string;
  initialQuestion?: string;
}) {
  const t = useT();
  const [messages, setMessages] = useState(initialMessages);
  const [quota, setQuota] = useState(initialQuota);
  const [input, setInput] = useState(initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AskToolName | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, busy]);

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
        body: JSON.stringify({ question: text, ...(matchId ? { matchId } : {}) }),
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
        } else if (event.type === "error") {
          done = true;
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

  async function clear() {
    try {
      await apiRequest("/api/v1/ask", { method: "DELETE" });
      setMessages([]);
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof ApiClientError ? e.message : t("ask.errors.offline"));
    }
  }

  return (
    <section aria-labelledby="ask-chat" className="panel flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ask-chat" className="flex items-center gap-2 text-base font-semibold">
          <BotMessageSquare aria-hidden className="size-4 text-gold" /> {t("ask.den")}
        </h2>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {plural(t, "ask.quota.left", quota.remaining)}
          </p>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
              <Trash2 aria-hidden className="size-4" /> {t("ask.clear")}
            </Button>
          )}
        </div>
      </div>

      {matchId && (
        <p className="rounded-md bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground">
          {t("ask.match.context", { id: matchId })}
        </p>
      )}

      <div role="log" aria-label={t("ask.title")} className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <Message key={`${m.at}-${i}`} message={m} />
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {status ? t(`ask.status.${status}`) : t("ask.thinking")}
          </p>
        )}
        <div ref={end} />
      </div>

      {messages.length === 0 && !busy && !out && (
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

      {out ? (
        <div className="space-y-1.5 rounded-lg border border-gold/25 bg-gold/[0.06] p-3 text-sm">
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
          className="flex items-end gap-2"
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
      <p className="text-xs text-muted-foreground">{t("ask.disclaimer")}</p>
    </section>
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
