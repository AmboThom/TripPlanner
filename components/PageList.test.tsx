import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { PageView } from "@/lib/pages-client";
import PageList from "./PageList";

const page = (title: string): PageView => ({ title, body: "x", updatedAt: "2026-10-12T23:58:00.000Z" });
const render = (pages: PageView[], selectedTitle: string | null = null) =>
  renderToStaticMarkup(<PageList pages={pages} selectedTitle={selectedTitle} onSelect={() => {}} />);

describe("the page list", () => {
  test("lists the pages in the order given, with their count", () => {
    const html = render([page("Sightseeing"), page("Flights"), page("Lisbon")]);

    expect(html.indexOf("Sightseeing")).toBeGreaterThan(-1);
    expect(html.indexOf("Flights")).toBeGreaterThan(html.indexOf("Sightseeing"));
    expect(html.indexOf("Lisbon")).toBeGreaterThan(html.indexOf("Flights"));
    expect(html).toMatch(/<span[^>]*>3<\/span>/);
  });

  test("each page is a button", () => {
    const html = render([page("Flights"), page("Lisbon")]);
    expect(html.match(/<button[^>]*type="button"/g)).toHaveLength(2);
  });

  test("marks only the chosen page as current", () => {
    const html = render([page("Flights"), page("Lisbon")], "Lisbon");

    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*>Lisbon</);
  });

  test("marks nothing as current when nothing is chosen", () => {
    expect(render([page("Flights")])).not.toContain("aria-current");
  });

  test("says why it is empty, and offers nothing to select", () => {
    const html = render([]);

    expect(html).toContain("No pages yet. They appear as you talk.");
    expect(html).not.toContain("<button");
    expect(html).toMatch(/<span[^>]*>0<\/span>/);
  });

  test("is a labelled navigation landmark", () => {
    expect(render([page("Flights")])).toMatch(/<nav[^>]*aria-label="Pages"/);
  });

  test("titles are text, never markup", () => {
    const html = render([page("<img src=x onerror=alert(1)>")]);

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
