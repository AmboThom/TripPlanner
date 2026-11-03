import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { PageView } from "@/lib/pages-client";
import PagePane from "./PagePane";

const flights: PageView = {
  title: "Flights",
  body: "# Flights\n\n## Outbound\n- **3 May** arrive Lisbon\n- Price: **$420 each**",
  updatedAt: "2026-10-12T23:58:11.357Z",
};
const render = (page: PageView) => renderToStaticMarkup(<PagePane page={page} onClose={() => {}} />);

describe("the page pane", () => {
  test("shows the title as its heading", () => {
    expect(render(flights)).toMatch(/<h2[^>]*id="page-pane-title"[^>]*>Flights<\/h2>/);
  });

  test("renders the body as markdown", () => {
    const html = render(flights);

    expect(html).toContain("<h2>Outbound</h2>");
    expect(html).toContain("<strong>3 May</strong>");
    expect(html).toContain("<li>");
  });

  test("does not repeat the title as a heading inside the body", () => {
    const html = render(flights);

    expect(html).not.toContain("<h1>Flights</h1>");
    // The title appears once, as the pane heading.
    expect(html.match(/>Flights</g)).toHaveLength(1);
  });

  test("keeps a heading that is not a repeat of the title", () => {
    expect(render({ ...flights, body: "# Itinerary\n\ntext" })).toContain("<h1>Itinerary</h1>");
  });

  test("has a labelled close button", () => {
    expect(render(flights)).toMatch(/<button[^>]*aria-label="Close page"/);
  });

  test("says when it was last updated, in UTC", () => {
    const html = render(flights);

    expect(html).toContain("Updated 12 Oct 2026, 23:58 UTC");
    expect(html).toContain('dateTime="2026-10-12T23:58:11.357Z"');
  });

  test("is labelled by its heading", () => {
    expect(render(flights)).toMatch(/<article[^>]*aria-labelledby="page-pane-title"/);
  });

  test("a hostile body is shown as text, not run", () => {
    const html = render({ ...flights, body: "<script>alert(1)</script>\n\n[x](javascript:alert(1))" });

    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/href=/);
  });
});
