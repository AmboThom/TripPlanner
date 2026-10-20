import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-tools-")), "test.db");

let tools: typeof import("./tools");
let store: typeof import("./db");

beforeAll(async () => {
  store = await import("./db");
  tools = await import("./tools");
});

const run = async (tool: { run: (args: never) => unknown }, args: unknown) =>
  String(await (tool.run as (a: unknown) => unknown)(args));

describe("list_pages", () => {
  test("returns the stored pages as JSON with snake_case fields", async () => {
    store.writePage({ title: "Flights", body: "v1", expectedUpdatedAt: null });

    const parsed = JSON.parse(await run(tools.listPagesTool, {}));
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Flights", updated_at: expect.any(String) }),
      ]),
    );
  });
});

describe("read_page", () => {
  test("returns the page body, matching the title case-insensitively", async () => {
    store.writePage({ title: "Lisbon", body: "Alfama, 3 nights", expectedUpdatedAt: null });

    const parsed = JSON.parse(await run(tools.readPageTool, { title: "LISBON" }));
    expect(parsed.title).toBe("Lisbon");
    expect(parsed.body).toBe("Alfama, 3 nights");
    expect(parsed.updated_at).toEqual(expect.any(String));
  });

  test("tells the assistant how to create a page that does not exist", async () => {
    const result = await run(tools.readPageTool, { title: "Nowhere" });
    expect(result).toMatch(/No page titled "Nowhere" exists/);
    expect(result).toMatch(/expected_updated_at set to null/);
  });
});

describe("write_page", () => {
  test("creates a page when expected_updated_at is null", async () => {
    const parsed = JSON.parse(
      await run(tools.writePageTool, {
        title: "Sightseeing",
        body: "Livraria Lello",
        expected_updated_at: null,
      }),
    );
    expect(parsed.title).toBe("Sightseeing");
    expect(store.readPage("Sightseeing")?.body).toBe("Livraria Lello");
  });

  test("replaces the body when given the token read_page returned", async () => {
    store.writePage({ title: "Porto", body: "v1", expectedUpdatedAt: null });
    const read = JSON.parse(await run(tools.readPageTool, { title: "Porto" }));

    await run(tools.writePageTool, {
      title: "Porto",
      body: "v2",
      expected_updated_at: read.updated_at,
    });

    expect(store.readPage("Porto")?.body).toBe("v2");
  });

  // The point of this layer. Each of these throws inside the store; if the tool
  // let it escape, the runner would abort and the turn would die instead of the
  // assistant reading the guidance and retrying.
  test("returns guidance instead of throwing on a stale token", async () => {
    store.writePage({ title: "Transport", body: "v1", expectedUpdatedAt: null });
    const stale = store.readPage("Transport")!.updatedAt;
    store.writePage({ title: "Transport", body: "v2", expectedUpdatedAt: stale });

    const result = await run(tools.writePageTool, {
      title: "Transport",
      body: "v3",
      expected_updated_at: stale,
    });

    expect(result).toMatch(/changed since it was read/);
    expect(result).toMatch(/read it again/i);
    expect(store.readPage("Transport")?.body).toBe("v2");
  });

  test("returns guidance instead of throwing when the page already exists", async () => {
    store.writePage({ title: "Expenses", body: "v1", expectedUpdatedAt: null });

    const result = await run(tools.writePageTool, {
      title: "Expenses",
      body: "v2",
      expected_updated_at: null,
    });

    expect(result).toMatch(/A page titled "Expenses" already exists/);
    expect(store.readPage("Expenses")?.body).toBe("v1");
  });

  test("returns guidance naming the stored spelling for a case variant", async () => {
    store.writePage({ title: "Shopping", body: "v1", expectedUpdatedAt: null });

    const result = await run(tools.writePageTool, {
      title: "  sHoPpInG  ",
      body: "v2",
      expected_updated_at: null,
    });

    expect(result).toMatch(/A page titled "Shopping" already exists/);
  });

  test.each(["Places &amp; Recommendations", "Caf&eacute;", "Tickets &#38; passes", "A &#x26; B"])(
    "rejects the HTML entity in %s instead of storing it",
    async (title) => {
      const before = store.listPages().length;

      const result = await run(tools.writePageTool, {
        title,
        body: "x",
        expected_updated_at: null,
      });

      expect(result).toMatch(/HTML entity/);
      expect(result).toMatch(/plain text/);
      expect(store.listPages().length).toBe(before);
    },
  );

  test("a bare ampersand in a title is fine", async () => {
    const result = await run(tools.writePageTool, {
      title: "Bars & cafes",
      body: "x",
      expected_updated_at: null,
    });

    expect(result).not.toMatch(/HTML entity/);
    expect(store.readPage("Bars & cafes")?.body).toBe("x");
  });

  test("returns guidance for an empty title without touching the store", async () => {
    const before = store.listPages().length;

    const result = await run(tools.writePageTool, {
      title: "   ",
      body: "x",
      expected_updated_at: null,
    });

    expect(result).toMatch(/needs a title/);
    expect(store.listPages().length).toBe(before);
  });
});
