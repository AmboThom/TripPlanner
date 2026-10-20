import { mkdtempSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-stub-")), "test.db");
process.env.ANTHROPIC_API_KEY = "sk-ant-stub-not-a-real-key";

// A local stand-in for the Anthropic API. The credential preflight is answered
// first; every later request is a model turn whose behavior the test picks.
type Mode =
  | "loop" // asks for list_pages on every request, forever
  | "slow" // same, but each reply takes 120ms
  | "reject" // 400s the turn
  | "text" // one finished text reply
  | "refusal" // the model refuses
  | "drop" // sends part of a reply, then cuts the connection
  | "twostep" // text plus a tool call, then more text and a finish
  | "failtool"; // asks for a write_page, then finishes

let mode: Mode = "loop";
let preflightStatus = 200;
let messageRequests = 0;
let requestBodies: string[] = [];
let server: Server;

const sse = (events: Array<[string, unknown]>) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const start = (): [string, unknown] => [
  "message_start",
  { type: "message_start", message: { id: "msg_stub", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } },
];
const textBlock = (index: number, text: string): Array<[string, unknown]> => [
  ["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } }],
  ["content_block_stop", { type: "content_block_stop", index }],
];
const toolBlock = (index: number, name: string, input: unknown): Array<[string, unknown]> => [
  ["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: `toolu_${index}`, name, input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }],
  ["content_block_stop", { type: "content_block_stop", index }],
];
const finish = (stopReason: string): Array<[string, unknown]> => [
  ["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1 } }],
  ["message_stop", { type: "message_stop" }],
];

// Each looping iteration says something before asking for the tool, as a real model
// does. Without text there is nothing to persist, and a test that asserts "stored
// nothing" would pass whether or not the persistence rule worked.
const toolUse = sse([
  start(),
  ...textBlock(0, "Working on it."),
  ...toolBlock(1, "list_pages", {}),
  ...finish("tool_use"),
]);

function reply(res: ServerResponse) {
  res.setHeader("content-type", "text/event-stream");
  switch (mode) {
    case "loop":
      return res.end(toolUse);
    case "slow":
      return void setTimeout(() => res.end(toolUse), 120);
    case "text":
      return res.end(sse([start(), ...textBlock(0, "Filed that under Flights."), ...finish("end_turn")]));
    case "refusal":
      return res.end(sse([start(), ...finish("refusal")]));
    case "drop":
      res.write(sse([start(), ...textBlock(0, "partial ").slice(0, 2)]));
      return void setTimeout(() => res.destroy(), 30);
    case "twostep":
      return res.end(
        messageRequests === 1
          ? sse([start(), ...textBlock(0, "Checking."), ...toolBlock(1, "list_pages", {}), ...finish("tool_use")])
          : sse([start(), ...textBlock(0, "Done."), ...finish("end_turn")]),
      );
    case "failtool":
      return res.end(
        messageRequests === 1
          ? sse([start(), ...toolBlock(0, "write_page", { title: "Flights", body: "x", expected_updated_at: null }), ...finish("tool_use")])
          : sse([start(), ...textBlock(0, "That did not save."), ...finish("end_turn")]),
      );
    default:
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "stub rejected the turn" } }));
  }
}

let route: typeof import("./route");
let store: typeof import("@/lib/db");
let assistant: typeof import("@/lib/assistant");

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/v1/models/")) {
      res.statusCode = preflightStatus;
      res.setHeader("content-type", "application/json");
      res.end(
        preflightStatus === 200
          ? JSON.stringify({ id: "claude-opus-5", type: "model", display_name: "stub", created_at: "2026-01-01T00:00:00Z" })
          : JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
      );
      return;
    }
    messageRequests++;
    let received = "";
    req.on("data", (chunk) => (received += chunk));
    req.on("end", () => {
      requestBodies.push(received);
      reply(res);
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  store = await import("@/lib/db");
  route = await import("./route");
  assistant = await import("@/lib/assistant");
});

afterAll(() => {
  delete process.env.ANTHROPIC_BASE_URL;
  server.close();
});

beforeEach(() => {
  messageRequests = 0;
  requestBodies = [];
  preflightStatus = 200;
});

const post = (message: string, signal?: AbortSignal) =>
  route.POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    }),
  );

const readAll = async (response: Response) => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
};

const assistantTurns = () => store.listMessages().filter((m) => m.role === "assistant");

describe("a model that asks for a tool forever", () => {
  // F-08. The SDK treats an unset max_iterations as "no cap", so before the fix
  // this made thousands of billed requests and the response never completed.
  test("is stopped at the iteration cap, and the user is told why", async () => {
    mode = "loop";
    const before = assistantTurns().length;

    const response = await post("We fly into Lisbon on the 3rd");
    const text = await readAll(response);

    expect(response.status).toBe(200);
    expect(messageRequests).toBe(assistant.MAX_TOOL_ITERATIONS);
    expect(text).toMatch(/Stopped: that took more steps than one turn allows/);
    // F-17. A capped turn never finished, so nothing is replayed to the model.
    expect(assistantTurns().length).toBe(before);
  });
});

describe("a client that goes away mid-turn", () => {
  // The other half of F-08. The request's abort signal has to reach the runner,
  // or the loop keeps running and billing for a reply nobody is reading.
  test("ends the turn instead of running on to the cap, and stores nothing", async () => {
    mode = "slow";
    const before = assistantTurns().length;
    const controller = new AbortController();

    const response = await post("Plan the whole trip", controller.signal);
    setTimeout(() => controller.abort(), 200);
    const text = await readAll(response);

    expect(text).toMatch(/The turn failed/);
    expect(messageRequests).toBeGreaterThan(0);
    expect(messageRequests).toBeLessThan(assistant.MAX_TOOL_ITERATIONS);
    expect(assistantTurns().length).toBe(before);
  });
});

describe("which turns are stored", () => {
  // F-17 and F-20. The history is replayed to the model on every later turn, so
  // only a turn the model actually finished may enter it.
  test("a finished turn is stored exactly as streamed", async () => {
    mode = "text";
    const before = assistantTurns().length;

    const text = await readAll(await post("We fly into Lisbon"));

    expect(text).toBe("Filed that under Flights.");
    const stored = assistantTurns();
    expect(stored).toHaveLength(before + 1);
    expect(stored[stored.length - 1].content).toBe("Filed that under Flights.");
  });

  test("a refusal is stored as its explanatory note", async () => {
    mode = "refusal";
    const before = assistantTurns().length;

    const text = await readAll(await post("something the model declines"));

    expect(text).toMatch(/I can't help with that one/);
    const stored = assistantTurns();
    expect(stored).toHaveLength(before + 1);
    expect(stored[stored.length - 1].content).toMatch(/I can't help with that one/);
  });

  test("a connection dropped mid-reply stores no half sentence", async () => {
    mode = "drop";
    const before = assistantTurns().length;

    const text = await readAll(await post("tell me about Porto"));

    expect(text).toMatch(/partial/);
    expect(text).toMatch(/The turn failed/);
    expect(assistantTurns().length).toBe(before);
  });

  test("text from separate loop iterations is stored as separate paragraphs", async () => {
    mode = "twostep";
    const before = assistantTurns().length;

    const text = await readAll(await post("check my pages"));

    expect(text).toBe("Checking.\n\nDone.");
    const stored = assistantTurns();
    expect(stored).toHaveLength(before + 1);
    expect(stored[stored.length - 1].content).toBe("Checking.\n\nDone.");
  });
});

describe("a turn the upstream rejects", () => {
  // F-10. The failure sentence used to be stored as the assistant's own turn and
  // replayed to the model on every later turn.
  test("reaches the user but is never stored as something the assistant said", async () => {
    mode = "reject";

    const text = await readAll(await post("Where should we eat?"));

    expect(text).toMatch(/The turn failed/);
    const stored = store.listMessages().map((m) => m.content).join("\n");
    expect(stored).not.toMatch(/The turn failed/);
    expect(stored).not.toMatch(/stub rejected the turn/);
  });

  // F-20. The credential preflight is the only place a bad key can still become a
  // real status code, so the mapping needs its own evidence.
  test("a key the API rejects is a 502 that names the variable", async () => {
    mode = "text";
    preflightStatus = 401;

    const response = await post("hello");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/ANTHROPIC_API_KEY/),
    });
    expect(messageRequests).toBe(0);
  });
});

describe("a store failure inside a tool", () => {
  // F-18. A thrown error from a tool does not abort the turn, whatever the old
  // comment claimed: the SDK catches it and reports it to the model as an error
  // result. This pins what actually happens.
  test("is reported to the model as an error, and the turn still completes", async () => {
    mode = "failtool";
    const db = store.getDb();
    db.exec(
      "CREATE TRIGGER fail_page_insert BEFORE INSERT ON pages BEGIN SELECT RAISE(ABORT, 'disk on fire'); END",
    );

    try {
      const response = await post("file the Lisbon flight");
      const text = await readAll(response);

      expect(response.status).toBe(200);
      expect(text).toBe("That did not save.");
      expect(messageRequests).toBe(2);
      expect(requestBodies[1]).toMatch(/"is_error":\s*true/);
    } finally {
      db.exec("DROP TRIGGER fail_page_insert");
    }
  });
});

describe("a reply that cannot be saved", () => {
  // F-19. The write sat unguarded in `finally`, so a store error errored the
  // stream: curl exits 18 and the user is told nothing.
  test("still closes the stream and says so", async () => {
    mode = "text";
    const db = store.getDb();
    db.exec(
      "CREATE TRIGGER fail_assistant_insert BEFORE INSERT ON messages WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'no space left'); END",
    );
    const before = assistantTurns().length;

    try {
      const text = await readAll(await post("hello"));

      expect(text).toMatch(/Filed that under Flights\./);
      expect(text).toMatch(/could not be saved/);
      expect(assistantTurns().length).toBe(before);
    } finally {
      db.exec("DROP TRIGGER fail_assistant_insert");
    }
  });
});

describe("a store that cannot be used", () => {
  // F-12. Must come last: it drops a table out from under the shared database.
  test("is a JSON 503, not an unhandled framework 500", async () => {
    mode = "loop";
    store.getDb().exec("DROP TABLE messages");

    const response = await post("anything at all");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/trip store/),
    });
    expect(messageRequests).toBe(0);
  });
});
