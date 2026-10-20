import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { apiErrorSentence } from "./api-error";

// Errors are built by the SDK's own factory, so the shape under test is the real one.
type ErrorBody = Parameters<typeof Anthropic.APIError.generate>[1];
const generate = (status: number, body: ErrorBody) =>
  Anthropic.APIError.generate(status, body, undefined, new Headers());

const CREDITS =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

describe("when the API supplies a sentence", () => {
  test.each([
    [400, "invalid_request_error", CREDITS],
    [403, "permission_error", "Your account is not permitted to use this model."],
    [404, "not_found_error", "model: claude-nope"],
    [529, "overloaded_error", "Overloaded"],
  ])("a %i returns that sentence, exactly", (status, type, message) => {
    const error = generate(status, { type: "error", error: { type, message }, request_id: "req_011Cabc" });
    expect(apiErrorSentence(error)).toBe(message);
  });

  test("the request id and the raw JSON never appear in the result", () => {
    const error = generate(400, {
      type: "error",
      error: { type: "invalid_request_error", message: CREDITS },
      request_id: "req_011CSECRETID",
    });

    const sentence = apiErrorSentence(error);

    expect(sentence).not.toContain("req_011CSECRETID");
    expect(sentence).not.toContain("request_id");
    expect(sentence).not.toContain("{");
    expect(sentence).not.toContain('"type"');
  });

  test("the SDK's own message is what this exists to avoid", () => {
    // Pins the problem: if the SDK ever starts returning a clean sentence here, this
    // function can be deleted.
    const error = generate(400, { type: "error", error: { type: "x", message: CREDITS } });
    expect(error.message).toContain("{");
    expect(apiErrorSentence(error)).not.toContain("{");
  });
});

describe("when the API supplies no usable sentence", () => {
  test.each([
    ["a body with no error object", { type: "error" }],
    ["an error object with no message", { type: "error", error: { type: "api_error" } }],
    ["a blank message", { type: "error", error: { message: "   " } }],
    ["a non-string message", { type: "error", error: { message: 42 } }],
    ["a null error", { type: "error", error: null }],
    ["a string body", "Bad Gateway"],
    ["no body at all", undefined],
  ])("%s falls back to the status sentence", (_label, body) => {
    expect(apiErrorSentence(generate(502, body))).toBe(
      "The Anthropic API returned an error (status 502).",
    );
  });
});

describe("when there is no HTTP status", () => {
  test("a dropped connection says it could not reach the API", () => {
    expect(apiErrorSentence(new Anthropic.APIConnectionError({}))).toBe(
      "Could not reach the Anthropic API.",
    );
  });

  test("a timeout says the same", () => {
    expect(apiErrorSentence(new Anthropic.APIConnectionTimeoutError())).toBe(
      "Could not reach the Anthropic API.",
    );
  });

  test("an abort says the same", () => {
    expect(apiErrorSentence(new Anthropic.APIUserAbortError())).toBe(
      "Could not reach the Anthropic API.",
    );
  });
});
