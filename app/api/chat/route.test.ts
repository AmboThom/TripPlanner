import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-route-")), "test.db");

let route: typeof import("./route");
let store: typeof import("@/lib/db");

beforeAll(async () => {
  store = await import("@/lib/db");
  route = await import("./route");
});

const originalKey = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

const post = (body: unknown, raw?: string) =>
  route.POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ?? JSON.stringify(body),
    }),
  );

describe("invalid input", () => {
  test.each([
    ["a blank message", { message: "   " }],
    ["a missing message", {}],
    ["a non-string message", { message: 42 }],
  ])("%s is rejected with 400 and persists nothing", async (_label, body) => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-used";
    const before = store.listMessages().length;

    const response = await post(body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(store.listMessages().length).toBe(before);
  });

  test("a body that is not JSON is rejected with 400", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-used";
    const before = store.listMessages().length;

    const response = await post(undefined, "not json at all");

    expect(response.status).toBe(400);
    expect(store.listMessages().length).toBe(before);
  });
});

describe("missing credentials", () => {
  test("no API key is 503, names the variable, and persists nothing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const before = store.listMessages().length;

    const response = await post({ message: "We fly into Lisbon on the 3rd" });

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(store.listMessages().length).toBe(before);
  });

  test("an empty API key is treated as missing, not as a credential", async () => {
    process.env.ANTHROPIC_API_KEY = "";
    const response = await post({ message: "anything" });
    expect(response.status).toBe(503);
  });
});
