import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import PageBody from "./PageBody";

const render = (body: string) => renderToStaticMarkup(<PageBody body={body} />);

describe("rendering", () => {
  test("turns markdown into real elements", () => {
    const html = render("## Outbound\n\n- **3 May** arrive\n- price");

    expect(html).toContain("<h2>Outbound</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>3 May</strong>");
  });

  test("keeps the non-ASCII text the assistant writes", () => {
    expect(render("Lisbon → Porto, €180")).toContain("Lisbon → Porto, €180");
  });
});

// Page bodies are text a model wrote and a user can steer.
describe("untrusted content", () => {
  test("raw HTML is shown as text, never as an element", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');

    // Nothing in the output is a real tag, and none carries a handler. The escaped
    // text may still contain the characters "onerror=", which is harmless because it
    // is visible text and not an attribute.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<[^>]*onerror/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  test("a javascript: link has no href", () => {
    const html = render("[bad](javascript:alert(1))");

    expect(html).not.toMatch(/href=/);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("bad");
  });

  test.each([
    ["a data: link", "[x](data:text/html;base64,PHNjcmlwdD4=)"],
    ["a vbscript: link", "[x](vbscript:msgbox)"],
    ["a relative link", "[x](/admin)"],
    ["a fragment link", "[x](#top)"],
  ])("%s has no href", (_label, markdown) => {
    expect(render(markdown)).not.toMatch(/href=/);
  });

  test("an image renders nothing", () => {
    const html = render("![pixel](https://example.com/p.png)");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("example.com");
  });

  test.each(["https://example.com/a", "http://example.com/a", "mailto:a@example.com"])(
    "a safe link to %s is kept and hardened",
    (url) => {
      const html = render(`[go](${url})`);

      expect(html).toContain(`href="${url}"`);
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    },
  );

  test("the link text of a refused link is still readable", () => {
    expect(render("[read this](javascript:alert(1))")).toContain("read this");
  });
});
