import { describe, expect, test } from "vitest";
import { NETWORK_FAILURE, failureMessage, readReply } from "./chat-client";

const bytes = (text: string) => new TextEncoder().encode(text);

function streamOf(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  );
}

describe("readReply", () => {
  test("hands over pieces in order and resolves with the whole reply", async () => {
    const pieces: string[] = [];

    const full = await readReply(streamOf([bytes("Filed "), bytes("that "), bytes("under Flights.")]), (p) =>
      pieces.push(p),
    );

    expect(pieces).toEqual(["Filed ", "that ", "under Flights."]);
    expect(full).toBe("Filed that under Flights.");
  });

  // A decoder that is not told to stream turns a split character into U+FFFD.
  test.each([
    ["a two-byte character", "café in Lisbon"],
    ["a three-byte character", "€180 for three days"],
    ["a four-byte character", "booked \u{1F600} done"],
  ])("%s split across two chunks arrives intact at every split point", async (_label, text) => {
    const all = bytes(text);

    for (let cut = 1; cut < all.length; cut++) {
      const response = streamOf([all.slice(0, cut), all.slice(cut)]);
      expect(await readReply(response, () => {})).toBe(text);
    }
  });

  test("a single character delivered one byte at a time is reassembled", async () => {
    const all = bytes("\u{1F600}");
    const full = await readReply(streamOf(Array.from(all, (b) => new Uint8Array([b]))), () => {});
    expect(full).toBe("\u{1F600}");
  });

  test("an empty body resolves to an empty string and calls nothing", async () => {
    const pieces: string[] = [];
    expect(await readReply(streamOf([]), (p) => pieces.push(p))).toBe("");
    expect(pieces).toEqual([]);
  });

  test("a response with no body at all resolves to an empty string", async () => {
    expect(await readReply(new Response(null), () => {})).toBe("");
  });

  test("a sequence cut off mid-character is flushed, not silently dropped", async () => {
    // First byte of a three-byte character, then the stream ends. The decoder is
    // holding that byte back, and the end of the stream must release it.
    const pieces: string[] = [];
    const full = await readReply(streamOf([bytes("ok "), new Uint8Array([0xe2])]), (p) =>
      pieces.push(p),
    );

    expect(full).toBe("ok \ufffd");
    expect(pieces.join("")).toBe(full);
  });
});

describe("failureMessage", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  test.each([
    [400, 'Send a non-empty "message" string.'],
    [415, 'Send the request with "content-type: application/json".'],
    [502, "The Anthropic API rejected the key in ANTHROPIC_API_KEY."],
    [503, "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart."],
  ])("returns the server's own sentence for a %i", async (status, error) => {
    expect(await failureMessage(json(status, { error }))).toBe(error);
  });

  test("falls back to a status-based sentence when the body is not JSON", async () => {
    const response = new Response("<html>Bad Gateway</html>", { status: 502 });
    expect(await failureMessage(response)).toBe(
      "The server could not handle that request (status 502).",
    );
  });

  test.each([
    ["an object with no error field", { detail: "nope" }],
    ["a blank error", { error: "   " }],
    ["a non-string error", { error: 42 }],
    ["a JSON null", null],
    ["a bare string", "oops"],
  ])("falls back for %s", async (_label, body) => {
    expect(await failureMessage(json(500, body))).toBe(
      "The server could not handle that request (status 500).",
    );
  });

  test("the network failure sentence is readable and non-empty", () => {
    expect(NETWORK_FAILURE).toMatch(/Could not reach the server/);
  });
});
