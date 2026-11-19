# ADR 0015: Ask Den, the AI chat

- Status: Proposed (built; in review)
- Date: 2026-11-19
- Extends: ADR 0014 (the coach's grounding rule and the shared AI budget), ADR 0013 (Plus)

## Context

Players ask the same questions over and over, mostly on phones and in English, Filipino/Taglish
or Bisaya: "Bakit ako talo lagi sa Pudge?", "What should I build on Lion?", "Asa ko mag-ward sa
10 min as Dire?", "Am I tilting tonight?". The answers are already in the app, spread over the
Overview, Heroes, Sessions, MMR journal, Guides and Meta pages. A chat can bring them together,
but a language model left alone invents numbers, builds and matchups, and costs money per call.
The roadmap listed this last as "Ask your stats: a chat that answers only through queries over
your data".

## Decision

A new `assistant` feature (ADR 0009 layout) adds **Ask Den** at `/ask` (signed in, in the "You"
section of the nav; under "More" on phones), plus an "Ask Den about this match" link on your own
match pages (`/ask?match=<id>`).

### Tools, not memory

The model (Groq, OpenAI-style tool calling; `ASK_MODEL`, default the coach's model, gpt-oss-120b)
gets nine read-only tools, each a thin adapter over the feature that owns the data
(`infrastructure/app-ask-data.ts`, wired with closures in the container):

| Tool              | Reads                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `my_recent_games` | your imported games (`matchQueries.heroFacts`), summarised with `summarizeMatches`                         |
| `my_hero_stats`   | your record on a hero, item timings and lanes from parsed replays, your toughest enemies (`heroesService`) |
| `match_summary`   | the coach's fact sheet of one of **your** matches (`matchCoachService.factSheet`), newest by default       |
| `my_sessions`     | latest session, losing streak, tilt stats, stop-loss status (`sessionService`)                             |
| `my_mmr`          | your MMR journal entries and medal (`mmrJournalService`, `playersService`)                                 |
| `hero_guide`      | build path, item timings, skill order and talents (`guideService`)                                         |
| `ward_spots`      | most used pro ward spots for a side and phase, described by map half and area (`guideService`)             |
| `hero_counters`   | a hero's best and worst matchups, plus your own record against it (`guideService`, `heroesService`)        |
| `meta_heroes`     | top heroes for a position in a bracket, your own bracket by default (`metaService`)                        |

Results are small JSON (`domain/ask-results.ts`, pure): rates as percentages with one decimal,
game clocks as "mm:ss", missing data marked (`"unknown"`, a note, or an error such as
`no_games_imported`), never filled in. Missing `party_size` stays **unknown**; an MMR is only
what the player logged (the session estimate is left out); nothing is estimated.

**Scoping.** No tool takes an account, user or Steam id; arguments are zod-validated with
`strict()` (unknown keys refused) and the server passes the signed-in owner to every personal
tool. `match_summary` refuses a match the player isn't in (`not_your_match`). Public aggregates
(guides, counters, meta, wards) need no owner. Profile visibility settings are about other people
viewing you, so they don't restrict your own chat.

### Grounding check

A loop (`services/ask.service.ts`) runs the tools the model asks for (at most 8 calls) and makes
at most 6 model calls per question; the last call is forced to answer (`tool_choice: none`).
Before anyone sees a reply it must pass two checks:

1. **Numbers** (the coach's rule, `src/common/utils/grounding.ts`): every number must be a value
   in this question's tool results (as given, rounded, or "3.8k"), the player's own message, an
   earlier checked answer in the chat, or today's date. Minute markers ("by minute 10", "10
   minuto") are exempt; clocks must match exactly.
2. **Names**: every hero or item name (from the catalogs) in the reply must appear in a tool
   result, the question or an earlier answer, apart from everyday items (wards, Smoke, Dust,
   TP scroll, Tango, Salve, Clarity). This stops builds and counters "from memory".

A failing reply is retried **once** with the problems listed; a second failure shows a fixed
safe message ("I couldn't back up an answer with your data, so I won't guess") and the question
isn't counted. Markdown emphasis is stripped (the chat shows plain text).

**Prompt injection.** The question (max 500 characters) is wrapped in `<question>` tags with
look-alike tags removed; the system prompt says it's only a question and that tool results are
data. The tools are read-only and scoped server-side, so an injected instruction can at worst
change the wording of an answer about the player's own data, and the checks still apply.

**Language.** The model answers in the question's language (English, Filipino/Taglish,
Cebuano/Bisaya), falling back to the site language (`getLocale()`); hero and item names stay as
the game writes them. Starter questions and all UI text are in en, fil and ceb.

### Limits and cost

- **Daily questions**: free **5**, Plus **100** (`ASK_FREE_PER_DAY`, `ASK_PLUS_PER_DAY`), per
  **Manila day** (resets at midnight Asia/Manila, 16:00 UTC). `assistant_usage` holds one
  document per user and day; `reserve()` is one atomic conditional upsert (count < limit), so
  concurrent tabs can't go past it. A question is reserved before the model is called and given
  back when no answer is written (model down, budget spent, checks failed twice).
- **Abuse**: 6 questions per minute per user (shared Redis limiter, `handler()`).
- **Budget**: every model call takes one unit of the shared daily AI budget
  (`DRAFT_AI_BUDGET_PER_DAY`); when it's spent Den "is resting" and nothing is counted. Calls
  are capped at `ASK_TIMEOUT_MS` (20 s) with one transport retry; the route's `maxDuration` is 60 s.
- **Off** without a Groq key (`MATCH_COACH_API_KEY`, else `GROQ_API_KEY`) or with
  `ASK_ENABLED=false`: the page says Ask Den isn't available and the match link is hidden.
- **Admin**: answered questions count as `ask_den` in "What gets used" (usage feature).

### Streaming and storage

`POST /api/v1/ask` streams NDJSON: `status` lines while tools run ("Checking your hero
stats…"), then one `answer` or `error` line. The answer itself isn't streamed token by token:
it has to pass the checks first. Refusals before a question is taken (quota, rate limit, off)
are ordinary error envelopes. A 1 KB blank first line gets past Safari's stream buffering.

`assistant_chats` keeps the last **10 turns** per user (`_id` = user id, `$push` with
`$slice`), removed by TTL **3 days** after the last message; "Clear chat" deletes it. Only the
words and source chips are kept, never tool results. Fallback turns are shown but not sent to
the model again. Both collections are in "Download your data" (`askDenChats`,
`askDenQuestions`) and deleted with the account; indexes are in `scripts/ensure-indexes.ts`.

**Source chips** under each answer come from the tools' own results ("your last 20 games",
"STRATZ Legend–Immortal pubs", "pro games", "Divine–Immortal public games", "your MMR
journal"), never from the model.

## Consequences

- One more feature on the shared AI budget, and a question can take up to 6 calls (usually 2–3).
  Watch `llm_budget_usage`; raise `DRAFT_AI_BUDGET_PER_DAY` or lower the limits if Ask Den
  crowds out the coach.
- The checks are strict, so some good answers cost a retry or end in the safe message. They
  check numbers and hero/item names, not every claim: general advice ("hook from fog") and
  ability names aren't verified, and because every number in a tool result counts as backed, a
  small number can pass by coincidence. Minute markers ("33 min") are exempt, as for the coach.
- Free players get a new daily AI allowance; nothing that was free became paid.
- Two new collections with personal data (`assistant_chats`, `assistant_usage`).
