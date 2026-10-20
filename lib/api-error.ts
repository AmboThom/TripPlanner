import type { APIError } from "@anthropic-ai/sdk";

const COULD_NOT_REACH = "Could not reach the Anthropic API.";

/** The API's own sentence, if the parsed error body carries one. */
function bodyMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  const inner = (body as { error?: unknown }).error;
  if (!inner || typeof inner !== "object") return null;

  const message = (inner as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

/**
 * One readable sentence for an error from the Anthropic API.
 *
 * The SDK's own `message` is the status code followed by the raw JSON body, request
 * id included, which is not something to put in front of a person. It has already
 * parsed that body onto `error.error`, and the API's sentence sits inside it. It is
 * returned exactly as the API wrote it.
 *
 * Without a sentence, an HTTP status gets a status sentence, and an error with no
 * status (a dropped connection, a timeout, an abort) gets a could-not-reach one.
 */
export function apiErrorSentence(error: APIError): string {
  const sentence = bodyMessage(error.error);
  if (sentence) return sentence;

  if (typeof error.status === "number") {
    return `The Anthropic API returned an error (status ${error.status}).`;
  }
  return COULD_NOT_REACH;
}
