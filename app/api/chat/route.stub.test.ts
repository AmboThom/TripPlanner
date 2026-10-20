import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-stub-")), "test.db");
process.env.ANTHROPIC_API_KEY = "sk-ant-stub-not-a-real-key";

// A local stand-in for the Anthropic API. It answers the credential preflight and
// then either asks for a tool on every request, forever, or rejects the turn.
type Mode = "loop" | "slow" | "reject";
let mode: Mode = "loop";
let messageRequests = 0;
let server: Server;

const sse = (events: Array<[string, unknown]>) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const toolUseTurn = sse([
  ["message_start", { type: "message_start", message: { id: "msg_stub", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_stub", name: "list_pages", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 1 } }],
  ["message_stop", { type: "message_stop" }],
]);

let route: typeof import("./route");
let store: typeof import("@/lib/db");
let assistant: typeof import("@/lib/assistant");

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/v1/models/")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "claude-opus-5", type: "model", display_name: "stub", created_at: "2026-01-01T00:00:00Z" }));
      return;
    }
    messageRequests++;
    req.resume();
    req.on("end", () => {
      if (mode === "reject") {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "stub rejected the turn" } }));
        return;
      }
      res.setHeader("content-type", "text/event-stream");
      if (mode === "slow") setTimeout(() => res.end(toolUseTurn), 120);
      else res.end(toolUseTurn);
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
});

const post = (message: string) =>
  route.POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
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

describe("a model that asks for a tool forever", () => {
  // F-08. The SDK treats an unset max_iterations as "no cap", so before the fix
  // this made thousands of billed requests and the response never completed.
  test("is stopped at the iteration cap, and the user is told why", async () => {
    mode = "loop";

    const response = await post("We fly into Lisbon on the 3rd");
    const text = await readAll(response);

    expect(response.status).toBe(200);
    expect(messageRequests).toBe(assistant.MAX_TOOL_ITERATIONS);
    expect(text).toMatch(/Stopped: that took more steps than one turn allows/);
  });

  test("leaves no assistant turn behind when the model produced no text", () => {
    const assistantTurns = store.listMessages().filter((m) => m.role === "assistant");
    expect(assistantTurns).toHaveLength(0);
  });
});

describe("a client that goes away mid-turn", () => {
  // The other half of F-08. The request's abort signal has to reach the runner,
  // or the loop keeps running and billing for a reply nobody is reading.
  test("ends the turn instead of running on to the cap", async () => {
    mode = "slow";
    const controller = new AbortController();

    const response = await route.POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Plan the whole trip" }),
        signal: controller.signal,
      }),
    );
    setTimeout(() => controller.abort(), 200);

    const text = await readAll(response);

    expect(text).toMatch(/The turn failed/);
    expect(messageRequests).toBeGreaterThan(0);
    expect(messageRequests).toBeLessThan(assistant.MAX_TOOL_ITERATIONS);
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
