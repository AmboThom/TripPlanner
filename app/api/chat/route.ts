import Anthropic from "@anthropic-ai/sdk";
import { MODEL, buildTurnParams } from "@/lib/assistant";
import { appendMessage, listMessages, listPages } from "@/lib/db";

const REFUSAL_NOTE =
  "I can't help with that one. Tell me something else about the trip.";

const CAP_NOTICE =
  "\n\n[Stopped: that took more steps than one turn allows. Send another message to continue.]";

const NOT_SAVED_NOTICE =
  "\n\n[This reply could not be saved to the conversation history.]";

const STORE_UNAVAILABLE =
  "The trip store could not be read or written. Check that the data folder is writable and try again.";

function problem(status: number, detail: string): Response {
  return Response.json({ error: detail }, { status });
}

function upstream(error: unknown): Response {
  if (error instanceof Anthropic.AuthenticationError) {
    return problem(502, "The Anthropic API rejected the key in ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return problem(502, "The Anthropic API is rate limiting this key. Try again shortly.");
  }
  if (error instanceof Anthropic.APIError) {
    return problem(502, `The Anthropic API failed: ${error.message}`);
  }
  // Deliberately generic, and never rethrown. A failure that is not an API error
  // can be a TypeError from fetch whose message quotes the rejected header value,
  // which here is the API key.
  return problem(502, "Could not reach the Anthropic API.");
}

export async function POST(request: Request): Promise<Response> {
  // Without this, a web page the user happens to have open can POST here as
  // text/plain, which a browser sends cross-origin with no preflight. Requiring
  // application/json forces the preflight, and this route sends no CORS headers,
  // so the browser blocks the request.
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return problem(415, 'Send the request with "content-type: application/json".');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "Send a JSON body.");
  }

  const raw = (body as { message?: unknown } | null)?.message;
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) {
    return problem(400, 'Send a non-empty "message" string.');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return problem(503, "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart.");
  }
  // The value is never echoed. A character the HTTP layer refuses makes fetch throw
  // an error that quotes the whole header, so catch it here by shape instead.
  if (/[^\x21-\x7e]/.test(apiKey)) {
    return problem(
      503,
      "ANTHROPIC_API_KEY contains a space, line break or other character that cannot be sent. Paste it again on one line.",
    );
  }

  // Persisted before the turn runs, so what the user said survives a failed turn.
  try {
    appendMessage("user", message);
  } catch {
    return problem(503, STORE_UNAVAILABLE);
  }

  const client = new Anthropic({ apiKey });

  // A credential preflight, because the turn itself cannot report one. The
  // runner starts its request lazily, inside the stream, and by then the status
  // line has been sent: a bad key would arrive as a 200 with an error sentence
  // in the body. This cheap GET also catches a key with no access to the model.
  try {
    await client.models.retrieve(MODEL);
  } catch (error) {
    return upstream(error);
  }

  let params: ReturnType<typeof buildTurnParams>;
  try {
    params = buildTurnParams(listMessages(), listPages());
  } catch {
    return problem(503, STORE_UNAVAILABLE);
  }

  // The signal ends the turn when the client goes away, instead of leaving the
  // loop running and billing for a reply nobody is reading.
  const runner = client.beta.messages.toolRunner(
    { ...params, stream: true },
    { signal: request.signal },
  );

  const encoder = new TextEncoder();
  // Set when the client disconnects. Hoisted so cancel() and start() share it:
  // enqueue and close on a cancelled stream throw.
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Only text the model produced is persisted, and only if it finished the
      // turn. Failure and cap notices go to the stream alone, and so does a turn
      // that was cut off: stored, either would be replayed to the model on every
      // later turn as something it said, a half sentence or a promise to file
      // something that never happened.
      let reply = "";
      let completed = false;

      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const emit = (text: string) => {
        reply += text;
        send(text);
      };

      let lastStopReason: string | null = null;

      const drain = async (messageStream: {
        [Symbol.asyncIterator](): AsyncIterator<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
        finalMessage(): Promise<Anthropic.Beta.Messages.BetaMessage>;
      }) => {
        let firstText = true;
        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            // Each loop iteration is a separate reply. Without a break the last
            // word of one runs straight into the first word of the next.
            if (firstText && reply.trim()) emit("\n\n");
            firstText = false;
            emit(event.delta.text);
          }
        }
        // Guard before trusting the turn: a refusal carries no usable content.
        const final = await messageStream.finalMessage();
        lastStopReason = final.stop_reason;
        if (final.stop_reason === "refusal") emit(REFUSAL_NOTE);
      };

      try {
        for await (const messageStream of runner) {
          await drain(messageStream);
        }
        // The SDK ends a capped loop with a bare break and no signal, so the only
        // evidence is that the last reply still wanted a tool.
        if (lastStopReason === "tool_use") send(CAP_NOTICE);
        // end_turn and refusal are the model finishing. tool_use here means the
        // cap cut it off; max_tokens means it ran out mid-sentence.
        completed = lastStopReason === "end_turn" || lastStopReason === "refusal";
      } catch (error) {
        send(
          error instanceof Anthropic.APIError
            ? `\n\n[The turn failed: ${error.message}]`
            : "\n\n[The turn failed before it finished.]",
        );
      } finally {
        if (completed && reply.trim()) {
          try {
            appendMessage("assistant", reply);
          } catch {
            // A store error here must not error the stream: the reply has already
            // been delivered, and an errored stream looks like a dropped connection.
            send(NOT_SAVED_NOTICE);
          }
        }
        if (!closed) controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
