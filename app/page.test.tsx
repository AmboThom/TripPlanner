import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test } from "vitest";

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-page-")), "test.db");

type ChatProps = { initialMessages: Array<Record<string, unknown>> };

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
