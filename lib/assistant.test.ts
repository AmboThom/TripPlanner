import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import type { Message, PageSummary } from "./db";

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-assistant-")), "test.db");

let assistant: typeof import("./assistant");

beforeAll(async () => {
  assistant = await import("./assistant");
});

const history: Message[] = [
  { role: "user", content: "We fly into Lisbon on the 3rd", createdAt: "2026-10-01T00:00:00.000Z" },
  { role: "assistant", content: "Added that to Flights.", createdAt: "2026-10-01T00:00:01.000Z" },
  { role: "user", content: "Actually the 5th", createdAt: "2026-10-02T00:00:00.000Z" },
];
const pages: PageSummary[] = [
  { title: "Flights", updatedAt: "2026-10-02T00:00:00.000Z" },
  { title: "Lisbon", updatedAt: "2026-10-01T00:00:00.000Z" },
];

describe("buildTurnParams", () => {
  test("targets the model and token budget the spec names", () => {
    const params = assistant.buildTurnParams(history, pages);
    expect(params.model).toBe("claude-opus-5");
    expect(params.max_tokens).toBe(64000);
  });

  // F-08. The SDK reads an unset max_iterations as "no cap", so this is the line
  // between a bounded turn and an unbounded, billed loop.
  test("caps the tool loop", () => {
    const params = assistant.buildTurnParams(history, pages);
    expect(params.max_iterations).toBe(assistant.MAX_TOOL_ITERATIONS);
    expect(assistant.MAX_TOOL_ITERATIONS).toBeGreaterThan(0);
  });

  test("marks the system prompt cacheable", () => {
    const params = assistant.buildTurnParams(history, pages);
    const system = params.system;
    if (typeof system === "string" || !system) throw new Error("expected system blocks");

    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toBe(assistant.SYSTEM_PROMPT);
  });

  // The cacheability requirement: titles change every turn, so they must sit
  // after the stable prefix rather than inside it.
  test("puts the page titles in the last message and never in the system prompt", () => {
    const params = assistant.buildTurnParams(history, pages);
    const last = params.messages[params.messages.length - 1];

    expect(last.role).toBe("system");
    expect(last.content).toContain("Flights");
    expect(last.content).toContain("Lisbon");
    expect(assistant.SYSTEM_PROMPT).not.toContain("Flights");
  });

  test("the trailing system message follows a user turn, as the API requires", () => {
    const params = assistant.buildTurnParams(history, pages);
    const beforeLast = params.messages[params.messages.length - 2];
    expect(beforeLast.role).toBe("user");
    expect(beforeLast.content).toBe("Actually the 5th");
  });

  test("replays the whole history in order ahead of it", () => {
    const params = assistant.buildTurnParams(history, pages);
    expect(params.messages.slice(0, 3).map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  test("says so plainly when no pages exist yet", () => {
    const params = assistant.buildTurnParams(history, []);
    expect(params.messages[params.messages.length - 1].content).toMatch(/No pages exist yet/);
  });

  test("refuses a history that does not end with the user's turn", () => {
    expect(() => assistant.buildTurnParams(history.slice(0, 2), pages)).toThrow(
      /end with the user's turn/,
    );
    expect(() => assistant.buildTurnParams([], pages)).toThrow(/end with the user's turn/);
  });

  test("offers the three tools", () => {
    const params = assistant.buildTurnParams(history, pages);
    expect(params.tools?.map((t) => (t as { name: string }).name)).toEqual([
      "list_pages",
      "read_page",
      "write_page",
    ]);
  });
});
