import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import Chat from "./Chat";

// The first render is what the server sends, so rendering to a string shows exactly
// what a reload restores. No DOM is needed, which is why this runs under Node.
const render = (messages: Parameters<typeof Chat>[0]["initialMessages"]) =>
  renderToStaticMarkup(<Chat initialMessages={messages} />);

describe("the first render", () => {
  test("restores the stored conversation in order, with no empty-state invitation", () => {
    const html = render([
      { role: "user", content: "We fly into Lisbon on the 3rd" },
      { role: "assistant", content: "Filed that under Flights." },
    ]);

    expect(html.indexOf("We fly into Lisbon on the 3rd")).toBeGreaterThan(-1);
    expect(html.indexOf("Filed that under Flights.")).toBeGreaterThan(
      html.indexOf("We fly into Lisbon on the 3rd"),
    );
    expect(html).not.toContain("Tell me about your trip");
  });

  test("shows an invitation, not an empty box, when nothing is stored", () => {
    expect(render([])).toContain("Tell me about your trip");
  });

  // Message text is untrusted: a model can echo a user's markup, and so can a page.
  test("renders message text as text and never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const html = render([{ role: "assistant", content: hostile }]);

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  test("keeps the line breaks the model wrote", () => {
    // Layout is pre-wrap CSS, so the newline must reach the DOM untouched.
    expect(render([{ role: "assistant", content: "Outbound\nReturn" }])).toContain("Outbound\nReturn");
  });
});

describe("accessibility of the first render", () => {
  const html = render([{ role: "user", content: "hi" }]);

  test("the transcript is a live log region that exists even when empty", () => {
    for (const markup of [html, render([])]) {
      expect(markup).toMatch(/role="log"/);
      expect(markup).toMatch(/aria-live="polite"/);
    }
  });

  test("the textarea has an associated label", () => {
    expect(html).toMatch(/<label[^>]*for="message"[^>]*>Message<\/label>/);
    expect(html).toMatch(/<textarea[^>]*id="message"/);
  });

  // Firefox restores a button's dynamic disabled state on reload, so the server's
  // "disabled" can reach React as "enabled" and fail hydration. These attributes are what
  // switch that off, and nothing else in the suite would notice them going missing.
  test("the composer form opts out of browser form-state restoration", () => {
    expect(html).toMatch(/<form[^>]*autoComplete="off"|<form[^>]*autocomplete="off"/i);
  });

  test("the Send button opts out too", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*autocomplete="off"|<button[^>]*autocomplete="off"[^>]*type="submit"/i);
  });

  test("starts with nothing to send and no error showing", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).not.toContain('role="alert"');
  });
});
