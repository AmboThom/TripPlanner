import type Anthropic from "@anthropic-ai/sdk";
import type { Message, PageSummary } from "./db";
import { tools } from "./tools";

export const MODEL = "claude-opus-5";

/** Streaming, so there is room for a long turn without an HTTP timeout. */
export const MAX_TOKENS = 64000;

/**
 * Upper bound on model requests in one turn. The SDK reads an unset
 * max_iterations as "no cap" rather than applying a default, so without this a
 * model that keeps asking for a tool (say, retrying a rejected write) loops, and
 * every pass is a separately billed request that replays the conversation. A
 * normal turn is list, read, write, so ten leaves room for retries.
 */
export const MAX_TOOL_ITERATIONS = 10;

export const SYSTEM_PROMPT = `You help one person plan a trip. As they talk, you keep a set of pages current.

1. Only capture concrete trip facts: decisions, bookings, prices, dates, places,
   recommendations. Not pleasantries, and not your own suggestions until the user
   takes them up.
2. Each page covers exactly one category of the trip: flights, a city, lodging,
   transport, sightseeing, shopping, expenses, and so on. You name the
   categories and there is no fixed list.
   Call list_pages before writing. Put the fact on the existing category page
   when it genuinely belongs to that category, and create a new category when
   none of them fits.
   Two things are failures, not judgment calls. Do not create a second page for
   a category that already exists under another name. Do not create a general
   page that holds everything, such as an overview, a summary, an itinerary, or
   one named after the trip: a fact that fits no existing category gets its own
   category page, never a new section on a catch-all page.
3. Call read_page before write_page. write_page replaces the whole body, so
   writing without reading destroys what was there. Fold the new information into
   what the page already says, and pass back the updated_at that read_page
   returned.
4. Say briefly what you filed, so the user can see you understood without opening
   the page.
5. Ask at most one question per reply, and only when a real detail is missing.
6. If a tool result says a page already exists or has changed, that is an
   instruction, not a failure. Read the page and try again.
7. Titles and bodies are plain text and markdown, never HTML. Write & and not
   &amp;.`;

function pagesNote(pages: PageSummary[]): string {
  if (pages.length === 0) {
    return "No pages exist yet. Anything worth keeping needs a new one.";
  }
  return `Pages that currently exist: ${pages.map((p) => p.title).join(", ")}.`;
}

/**
 * Stable content first so the prefix stays cacheable: the rules, then the
 * history. The page list changes every turn, so it goes last, as a
 * mid-conversation system message rather than in the system prompt where it
 * would invalidate the cached prefix behind it on every message.
 */
export function buildTurnParams(
  history: Message[],
  pages: PageSummary[],
): Anthropic.Beta.Messages.BetaToolRunnerParams {
  const last = history[history.length - 1];
  if (!last || last.role !== "user") {
    throw new Error(
      "buildTurnParams expects the history to end with the user's turn; " +
        "persist the message before building the request.",
    );
  }

  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    max_iterations: MAX_TOOL_ITERATIONS,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: "system", content: pagesNote(pages) },
    ],
    tools,
  };
}
