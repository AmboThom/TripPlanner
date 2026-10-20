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

describe("content type", () => {
  // F-15. A text/plain POST is a CORS "simple request": a browser sends it
  // cross-origin with no preflight. Requiring application/json forces one, and this
  // route sends no CORS headers, so the browser blocks the call.
  const rawPost = (headers: Record<string, string>, body: BodyInit | null) =>
    route.POST(new Request("http://localhost/api/chat", { method: "POST", headers, body }));

  test.each([
    ["text/plain", { "content-type": "text/plain" }],
    ["a form encoding", { "content-type": "application/x-www-form-urlencoded" }],
    ["multipart", { "content-type": "multipart/form-data; boundary=x" }],
  ])("%s is rejected with 415 and persists nothing", async (_label, headers) => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-used";
    const before = store.listMessages().length;

    const response = await rawPost(headers, JSON.stringify({ message: "written by another site" }));

    expect(response.status).toBe(415);
    expect(store.listMessages().length).toBe(before);
  });

  test("a request with no content type at all is rejected with 415", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-used";
    const before = store.listMessages().length;

    const response = await rawPost({}, new Uint8Array([123, 125]));

    expect(response.status).toBe(415);
    expect(store.listMessages().length).toBe(before);
  });

  test.each(["application/json", "application/json; charset=utf-8", "Application/JSON"])(
    "%s is accepted (a blank message then fails on its own, with 400)",
    async (contentType) => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-not-used";

      const response = await rawPost({ "content-type": contentType }, JSON.stringify({ message: " " }));

      expect(response.status).toBe(400);
    },
  );
});

describe("a malformed API key", () => {
  // F-16. A header value the HTTP layer refuses makes fetch throw a TypeError whose
  // message quotes the whole value, so the key reached the server log. Caught by
  // shape before any request is built, and never echoed.
  const SECRET = "sk-ant-api03-DISTINCTIVESECRETVALUE";

  test.each([
    ["an embedded newline", `${SECRET}\nbroken`],
    ["an embedded space", `${SECRET} broken`],
    ["a non-ASCII character", `${SECRET}\u00e9`],
  ])("%s is a 503 that names the variable and never echoes the key", async (_label, key) => {
    process.env.ANTHROPIC_API_KEY = key;
    const before = store.listMessages().length;

    const response = await post({ message: "hello" });
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).toMatch(/ANTHROPIC_API_KEY/);
    expect(text).not.toContain("DISTINCTIVESECRETVALUE");
    expect(store.listMessages().length).toBe(before);
  });
});

describe("a failure that is not an API error", () => {
  // F-16, the other half. upstream() used to rethrow anything that was not an API
  // error, so POST rejected, the route returned an empty 500, and the error text,
  // which can quote a header value, went to the server log. A base URL with a space
  // in it makes the SDK throw a plain TypeError before any request is sent.
  test("is a generic 502 and does not escape the handler", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-valid-looking-key";
    process.env.ANTHROPIC_BASE_URL = "http://exa mple.com";

    try {
      const response = await post({ message: "hello" });
      const payload = (await response.json()) as { error: string };

      expect(response.status).toBe(502);
      expect(payload.error).toBe("Could not reach the Anthropic API.");
      expect(payload.error).not.toContain("sk-ant-valid-looking-key");
    } finally {
      delete process.env.ANTHROPIC_BASE_URL;
    }
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
