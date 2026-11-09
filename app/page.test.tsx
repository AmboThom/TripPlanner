import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test, vi } from "vitest";

// Workspace calls useRouter, which throws when no app router is mounted, as under
// renderToStaticMarkup. Only the first render is checked here, so a stub is enough.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-page-")), "test.db");

type ChatProps = { initialMessages: Array<Record<string, unknown>> };
type WorkspaceProps = ChatProps & { pages: Array<Record<string, unknown> & { title: string }> };

let page: typeof import("./page");
let store: typeof import("@/lib/db");

beforeAll(async () => {
  store = await import("@/lib/db");
  page = await import("./page");
});

describe("the home page", () => {
  // Without this, Next prerenders the page at `next build`: the conversation is
  // frozen into the build output and the database is opened during the build. The
  // build's route table shows it too, but that is a check someone has to remember.
  test("opts out of static rendering", () => {
    expect(page.dynamic).toBe("force-dynamic");
  });

  test("renders what is stored when it is rendered, not what was stored earlier", () => {
    expect(renderToStaticMarkup(page.default())).toContain("Tell me about your trip");

    store.appendMessage("user", "We fly into Lisbon on the 3rd");
    store.appendMessage("assistant", "Filed that under Flights.");

    const html = renderToStaticMarkup(page.default());
    expect(html).toContain("We fly into Lisbon on the 3rd");
    expect(html).toContain("Filed that under Flights.");
    expect(html).not.toContain("Tell me about your trip");
  });

  test("lists the stored pages, newest first, and opens none of them", () => {
    // Explicit timestamps: two writes in the same millisecond tie on updated_at, and the
    // store then falls back to title order, which would make this test depend on timing.
    const insert = store
      .getDb()
      .prepare("INSERT INTO pages (title, title_key, body, updated_at) VALUES (?, ?, ?, ?)");
    insert.run("Alpha page", "alpha page", "# Alpha page\n\nfirst", "2030-01-01T00:00:00.000Z");
    insert.run("Beta page", "beta page", "# Beta page\n\nsecond", "2030-01-02T00:00:00.000Z");

    const html = renderToStaticMarkup(page.default());

    expect(html.indexOf("Beta page")).toBeGreaterThan(-1);
    expect(html.indexOf("Alpha page")).toBeGreaterThan(html.indexOf("Beta page"));
    // Nothing is chosen until the user chooses, so no pane is in the first render.
    expect(html).not.toContain("<article");
    expect(html).not.toContain("first</p>");
  });

  test("passes the client only a page's title, body and updatedAt", () => {
    const main = page.default() as ReactElement<{ children: ReactElement<WorkspaceProps> }>;
    const pages = main.props.children.props.pages;

    expect(pages.length).toBeGreaterThan(0);
    for (const entry of pages) {
      expect(Object.keys(entry).sort()).toEqual(["body", "title", "updatedAt"]);
    }
  });

  test("passes the pages in the store's own order", () => {
    const main = page.default() as ReactElement<{ children: ReactElement<WorkspaceProps> }>;
    const passed = main.props.children.props.pages.map((entry) => entry.title);

    expect(passed).toEqual(store.listPages().map((entry) => entry.title));
  });

  test("hands the component only the fields it renders", () => {
    store.appendMessage("user", "one more message");

    // Whatever is passed as a prop to a client component is serialized into the page
    // payload, so createdAt must not be among it. The rendered HTML would not show a
    // stray field, so inspect the props themselves.
    const main = page.default() as ReactElement<{ children: ReactElement<ChatProps> }>;
    const messages = main.props.children.props.initialMessages;

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(Object.keys(message).sort()).toEqual(["content", "role"]);
    }
  });
});
