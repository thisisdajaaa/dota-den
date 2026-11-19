import { AppError } from "@/common/errors/app-error";
import type { ToolCall, ToolChatMessage } from "@/common/llm/groq-client";
import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import type { GroundFact } from "@/common/utils/grounding";
import {
  ASK_CHAT_TTL_MS,
  ASK_KEEP_MESSAGES,
  ASK_MAX_CONVERSATIONS,
  conversationTitle,
  modelHistory,
  type AskMessage,
} from "../domain/ask-chat";
import {
  factsFromResult,
  factsFromText,
  unbackedNames,
  ungroundedReply,
} from "../domain/ask-grounding";
import {
  askSystemPrompt,
  groundingRetry,
  wrapQuestion,
  type AskLocale,
} from "../domain/ask-prompt";
import {
  askDay,
  askQuota,
  dailyLimit,
  nextReset,
  type AskLimits,
  type AskQuota,
} from "../domain/ask-quota";
import { errorResult, type ToolResult } from "../domain/ask-results";
import { mergeSources, type AskSource } from "../domain/ask-sources";
import {
  toConversationDto,
  toMessageDto,
  type AskAnswerDto,
  type AskConversationDto,
  type AskStateDto,
} from "../dtos/responses/ask.dto";
import {
  ASK_TOOL_DEFINITIONS,
  parseToolArgs,
  type AskRequest,
  type AskToolArgs,
  type AskToolName,
} from "../schemas/ask-tools.schema";
import type {
  AskChatsPort,
  AskDataPort,
  AskModel,
  AskOwner,
  AskUsagePort,
} from "../assistant.ports";

/** Model calls per question at most: tool rounds, the answer and one grounding retry. */
export const MAX_MODEL_CALLS = 6;
/** Tool calls per question at most (a model asking for more gets an error result). */
export const MAX_TOOL_CALLS = 8;
/**
 * Answers that fail the checks are given back this many times a Manila day; after that they
 * count, so failing on purpose can't spend the shared AI budget for free.
 */
export const MAX_FREE_FALLBACKS = 3;
/** Longest answer kept; anything longer is cut at a sentence. */
const MAX_ANSWER_CHARS = 2_000;

/** A question taken from the player's daily allowance, to answer (or give back). */
export interface AskTicket {
  owner: AskOwner;
  day: string;
  plus: boolean;
}

export type AskEmit = (event: { type: "status"; tool: AskToolName }) => void;

/**
 * Ask Den (ADR 0015): a chat that answers a player's Dota questions only from our data. The
 * model gets tools (thin adapters over other features' services, scoped to the signed-in
 * player) and must call them for facts; every number in its reply is checked against what the
 * tools returned. A reply that fails is retried once with the problems, then replaced by a
 * safe "couldn't answer" message. Free players get a few questions per Manila day, Plus more.
 */
export class AskService {
  constructor(
    private readonly deps: {
      /** null when no Groq key is set (Ask Den is off). */
      model: AskModel | null;
      data: AskDataPort;
      chats: AskChatsPort;
      usage: AskUsagePort;
      isPlus: (userId: string) => Promise<boolean>;
      /** Hero and item names (the catalogs), for the name check; empty skips it. */
      names?: () => Promise<readonly string[]>;
      /** The shared daily model-call budget (ADR 0014). */
      budget: { take(): Promise<boolean> };
      limits: AskLimits;
      /** Counts an answered question (admin usage); never fails. */
      used?: (userId: string) => Promise<void>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  get enabled(): boolean {
    return this.deps.model !== null;
  }

  private async plus(userId: string): Promise<boolean> {
    return this.deps.isPlus(userId).catch((error: unknown) => {
      this.deps.logger.warn("ask_plus_lookup_failed", { error });
      return false;
    });
  }

  async quota(userId: string, plus?: boolean): Promise<AskQuota> {
    const now = this.now();
    const isPlus = plus ?? (await this.plus(userId));
    const used = await this.deps.usage.used(userId, askDay(now)).catch(() => 0);
    return askQuota({ plus: isPlus, used, now, limits: this.deps.limits });
  }

  /**
   * The chat page's state: the player's conversations, the open one (`conversationId`, or
   * the newest when none is asked for; a new chat when it isn't theirs) and today's allowance.
   */
  async state(owner: AskOwner, conversationId?: string): Promise<AskStateDto> {
    const [quota, conversations] = await Promise.all([
      this.quota(owner.userId),
      this.deps.chats.list(owner.userId, ASK_MAX_CONVERSATIONS).catch(() => []),
    ]);
    const openId = conversationId ?? conversations[0]?.id;
    const messages = openId
      ? await this.deps.chats.get(owner.userId, openId).catch(() => null)
      : null;
    return {
      enabled: this.enabled,
      quota,
      plusLimit: this.deps.limits.plus,
      conversations: conversations.map(toConversationDto),
      conversationId: messages ? (openId ?? null) : null,
      messages: (messages ?? []).map(toMessageDto),
    };
  }

  /** One of the player's conversations; not found when it isn't theirs. */
  async conversation(owner: AskOwner, id: string) {
    const messages = await this.deps.chats.get(owner.userId, id);
    if (!messages) throw notFound();
    return { conversationId: id, messages: messages.map(toMessageDto) };
  }

  /** Takes one question from today's allowance; throws when it's used up or Ask Den is off. */
  async reserve(owner: AskOwner): Promise<AskTicket> {
    if (!this.deps.model)
      throw new AppError("upstream_unavailable", "Ask Den isn't set up on this server.", {
        reason: "not_configured",
      });
    const now = this.now();
    const plus = await this.plus(owner.userId);
    const day = askDay(now);
    const limit = dailyLimit(plus, this.deps.limits);
    // Kept a day past the Manila day it counts for, then removed by TTL.
    const expiresAt = new Date(nextReset(now).getTime() + 86_400_000);
    if (!(await this.deps.usage.reserve(owner.userId, day, limit, expiresAt))) {
      throw new AppError("rate_limited", "You've used today's questions.", {
        reason: "quota",
        quota: await this.quota(owner.userId, plus),
      });
    }
    return { owner, day, plus };
  }

  /** Forgets one conversation, or all of them when no id is given. */
  async clear(owner: AskOwner, conversationId?: string): Promise<void> {
    if (!conversationId) return this.deps.chats.clear(owner.userId);
    if (!(await this.deps.chats.remove(owner.userId, conversationId))) throw notFound();
  }

  /**
   * Answers a question with a reserved ticket. The question is given back when no answer
   * could be written: always when the model or budget failed, and up to
   * MAX_FREE_FALLBACKS times a day when the reply failed the checks twice.
   */
  async answer(
    ticket: AskTicket,
    request: AskRequest,
    locale: AskLocale,
    emit: AskEmit = () => {},
  ): Promise<AskAnswerDto> {
    const { owner } = ticket;
    // Settled: the question was counted or given back (nothing left for `finally`).
    let settled = false;
    try {
      // A conversation that isn't the player's is "not found" (and the question is given back).
      const earlier = request.conversationId
        ? await this.deps.chats.get(owner.userId, request.conversationId)
        : [];
      if (!earlier) throw notFound();
      const history = modelHistory(earlier);
      const result = await this.run(owner, request, locale, history, emit);
      const now = this.now();
      const question: AskMessage = { role: "user", text: request.question, at: now };
      const answer: AskMessage = result.fallback
        ? { role: "assistant", text: "", sources: [], fallback: true, at: now }
        : { role: "assistant", text: result.text, sources: result.sources, at: now };
      const conversation = await this.save(owner.userId, request, [question, answer], now);
      if (!result.fallback) {
        settled = true;
        await this.deps.used?.(owner.userId);
      } else {
        settled = true;
        await this.deps.usage
          .release(owner.userId, ticket.day, { fallback: true, maxFallbacks: MAX_FREE_FALLBACKS })
          .catch(() => false);
      }
      this.deps.logger.info("ask_answered", {
        tools: result.tools,
        modelCalls: result.calls,
        fallback: result.fallback,
        plus: ticket.plus,
      });
      return {
        conversation,
        question: toMessageDto(question),
        answer: toMessageDto(answer),
        quota: await this.quota(owner.userId, ticket.plus),
      };
    } finally {
      if (!settled) await this.deps.usage.release(owner.userId, ticket.day).catch(() => false);
    }
  }

  /** Saves the turn to its conversation (a new one when none was given); never fails. */
  private async save(
    userId: string,
    request: AskRequest,
    turn: readonly AskMessage[],
    now: Date,
  ): Promise<AskConversationDto | null> {
    const expiresAt = new Date(now.getTime() + ASK_CHAT_TTL_MS);
    try {
      if (request.conversationId) {
        const kept = await this.deps.chats.append(userId, request.conversationId, turn, {
          keep: ASK_KEEP_MESSAGES,
          now,
          expiresAt,
        });
        if (kept) return { id: request.conversationId, title: null, updatedAt: now.toISOString() };
      }
      const title = conversationTitle(request.question);
      const id = await this.deps.chats.create(userId, turn, {
        title,
        now,
        expiresAt,
        maxConversations: ASK_MAX_CONVERSATIONS,
      });
      return { id, title, updatedAt: now.toISOString() };
    } catch (error) {
      this.deps.logger.warn("ask_chat_save_failed", { error });
      return null;
    }
  }

  /** The tool-calling loop. */
  private async run(
    owner: AskOwner,
    request: AskRequest,
    locale: AskLocale,
    history: readonly AskMessage[],
    emit: AskEmit,
  ): Promise<{
    text: string;
    sources: AskSource[];
    fallback: boolean;
    tools: string[];
    calls: number;
  }> {
    const model = this.deps.model!;
    const today = askDay(this.now());
    const messages: ToolChatMessage[] = [
      { role: "system", content: askSystemPrompt({ locale, today, matchId: request.matchId }) },
      ...history.map((m) => ({
        role: m.role,
        content: m.role === "user" ? wrapQuestion(m.text) : withoutRoleLines(m.text),
      })),
      { role: "user", content: wrapQuestion(request.question) },
    ];
    // The player's words, today's date and earlier checked answers may be repeated.
    const facts: GroundFact[] = [
      ...factsFromText(request.question, "question"),
      ...factsFromText(today, "today"),
      ...(request.matchId ? factsFromText(request.matchId, "matchId") : []),
      ...history.flatMap((m, i) => factsFromText(m.text, `history${i}`)),
    ];
    // What names may be backed by: the player's words, earlier answers, every tool result.
    const backing: string[] = [request.question, ...history.map((m) => m.text)];
    const catalog = await (this.deps.names?.() ?? Promise.resolve([])).catch(() => []);
    const sources: AskSource[] = [];
    const tools: string[] = [];
    let retried = false;

    for (let call = 1; call <= MAX_MODEL_CALLS; call++) {
      if (!(await this.deps.budget.take()))
        throw new AppError("upstream_unavailable", "Ask Den is resting. Try again later.", {
          reason: "resting",
        });
      const last = call === MAX_MODEL_CALLS || tools.length >= MAX_TOOL_CALLS;
      const reply = await model.next(messages, {
        tools: ASK_TOOL_DEFINITIONS,
        toolChoice: last ? "none" : "auto",
      });
      if (!reply.ok) {
        this.deps.logger.warn("ask_model_unavailable", { cause: reply.error.cause, call });
        if (reply.error.type === "unavailable")
          throw new AppError("upstream_unavailable", "Ask Den can't reach the AI right now.", {
            reason: "unavailable",
          });
        continue;
      }
      const turn = reply.value;
      if (turn.toolCalls.length > 0 && !last) {
        messages.push({ role: "assistant", content: turn.content, toolCalls: turn.toolCalls });
        // A turn asking for more tools than a question may use gets only the first few.
        for (const tc of turn.toolCalls.slice(0, MAX_TOOL_CALLS)) {
          const result = await this.tool(owner, tc, tools, emit);
          facts.push(...factsFromResult(result.data, `t${tools.length}`));
          backing.push(JSON.stringify(result.data));
          sources.push(...result.sources);
          messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(result.data) });
        }
        continue;
      }
      const text = cut(plainText(turn.content ?? ""));
      if (!text) continue;
      const ungrounded = ungroundedReply(text, facts);
      const names = unbackedNames(text, catalog, backing);
      if (ungrounded.length === 0 && names.length === 0)
        return { text, sources: mergeSources(sources), fallback: false, tools, calls: call };
      this.deps.logger.warn("ask_reply_rejected", {
        call,
        ungrounded: ungrounded.slice(0, 10),
        names: names.slice(0, 10),
      });
      if (retried) break;
      retried = true;
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: groundingRetry(ungrounded, names) });
    }
    return { text: "", sources: [], fallback: true, tools, calls: MAX_MODEL_CALLS };
  }

  /** Runs one tool call, scoped to the owner. Bad calls become error results for the model. */
  private async tool(
    owner: AskOwner,
    call: ToolCall,
    used: string[],
    emit: AskEmit,
  ): Promise<ToolResult> {
    if (used.length >= MAX_TOOL_CALLS)
      return errorResult("too_many_tool_calls", "Answer with the data you already have.");
    const parsed = parseToolArgs(call.name, call.arguments);
    if (!parsed.ok) {
      used.push(`invalid:${call.name.slice(0, 40)}`);
      return errorResult(parsed.error);
    }
    used.push(parsed.name);
    try {
      emit({ type: "status", tool: parsed.name });
    } catch {
      // A status line is only a nicety.
    }
    try {
      return await this.dispatch(owner, parsed.name, parsed.args);
    } catch (error) {
      this.deps.logger.warn("ask_tool_failed", { tool: parsed.name, error });
      return errorResult("unavailable", "This data couldn't be loaded right now.");
    }
  }

  private dispatch(owner: AskOwner, name: AskToolName, args: unknown): Promise<ToolResult> {
    const d = this.deps.data;
    switch (name) {
      case "my_recent_games":
        return d.recentGames(owner, args as AskToolArgs<"my_recent_games">);
      case "my_hero_stats":
        return d.heroStats(owner, args as AskToolArgs<"my_hero_stats">);
      case "match_summary":
        return d.matchSummary(owner, args as AskToolArgs<"match_summary">);
      case "my_sessions":
        return d.sessions(owner);
      case "my_mmr":
        return d.mmr(owner);
      case "hero_guide":
        return d.heroGuide(args as AskToolArgs<"hero_guide">);
      case "ward_spots":
        return d.wardSpots(args as AskToolArgs<"ward_spots">);
      case "hero_counters":
        return d.heroCounters(owner, args as AskToolArgs<"hero_counters">);
      case "meta_heroes":
        return d.metaHeroes(owner, args as AskToolArgs<"meta_heroes">);
      case "patch_notes":
        return d.patchNotes(args as AskToolArgs<"patch_notes">);
    }
  }

  exportMyData(owner: DataOwner) {
    return Promise.all([
      this.deps.chats.exportForOwner(owner),
      this.deps.usage.exportForOwner(owner),
    ]).then(([chats, uses]) => ({ askDenChats: chats, askDenQuestions: uses }));
  }

  async deleteMyData(owner: DataOwner) {
    const [chats, uses] = await Promise.all([
      this.deps.chats.deleteForOwner(owner),
      this.deps.usage.deleteForOwner(owner),
    ]);
    return { askDenChats: chats, askDenQuestions: uses };
  }
}

const notFound = () =>
  new AppError("not_found", "That conversation doesn't exist any more.", {
    reason: "conversation_not_found",
  });

/**
 * An earlier answer as the model sees it again: lines that pose as instructions ("System:",
 * "<question>") are dropped, so a jailbreak that slipped into one answer isn't replayed.
 */
export function withoutRoleLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*(?:system|developer|assistant|user|tool)\s*:|<\/?\s*question\s*>/i.test(l))
    .join("\n");
}

/** The reply as plain text: markdown emphasis and headings dropped (the chat shows text). */
function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/** An answer cut to the limit, at the last sentence end when there is one. */
function cut(text: string): string {
  if (text.length <= MAX_ANSWER_CHARS) return text;
  const head = text.slice(0, MAX_ANSWER_CHARS);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("\n"));
  return (end > MAX_ANSWER_CHARS / 2 ? head.slice(0, end + 1) : head).trim();
}
