/** Shown when the request never produced a response at all. */
export const NETWORK_FAILURE = "Could not reach the server. Check that it is running and try again.";

/**
 * Reads a streamed reply and hands each decoded piece to `onText` as it arrives,
 * then resolves with the whole text.
 *
 * Decoding is incremental: a multi-byte character can straddle two chunks, and
 * decoding each chunk on its own would turn it into replacement characters.
 */
export async function readReply(
  response: Response,
  onText: (piece: string) => void,
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    const piece = decoder.decode(value, { stream: true });
    if (piece) {
      full += piece;
      onText(piece);
    }
  }

  // Flushes anything the decoder was holding back, such as a truncated sequence.
  const rest = decoder.decode();
  if (rest) {
    full += rest;
    onText(rest);
  }
  return full;
}

/** One readable sentence for a response that is not OK. */
export async function failureMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string" &&
      payload.error.trim()
    ) {
      return payload.error;
    }
  } catch {
    // Not JSON, or an unreadable body. Fall through to the status-based sentence.
  }
  return `The server could not handle that request (status ${response.status}).`;
}

/** What the page hands the chat component: the two fields it renders. */
export type ChatMessage = { role: "user" | "assistant"; content: string };
