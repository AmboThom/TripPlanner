import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

// getDb reads TRIP_DB_PATH once, on its first call, so the path has to be set
// before the module is evaluated. That rules out a static import here.
process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-binder-")), "test.db");

let store: typeof import("./db");

beforeAll(async () => {
  store = await import("./db");
});

/** Rows sharing one logical title. More than one means uniqueness failed. */
function rowsFor(title: string): number {
  const key = title.trim().normalize("NFC").toLowerCase();
  const row = store
    .getDb()
    .prepare("SELECT COUNT(*) AS n FROM pages WHERE title_key = ?")
    .get(key) as { n: number };
  return row.n;
}

describe("title uniqueness", () => {
  // COLLATE NOCASE folds ASCII A-Z only, which is what F-01 was. Every accented
  // pair below created a second page before the derived key replaced it.
  test.each([
    ["Flights", "FLIGHTS"],
    ["Fluege", "FLUEGE"],
    ["Flüge", "FLÜGE"],
    ["Étape", "étape"],
    ["Café", "CAFÉ"],
    ["Zürich", "ZÜRICH"],
  ])("%s and %s are one page, not two", (first, second) => {
    store.writePage({ title: first, body: "first", expectedUpdatedAt: null });

    expect(() =>
      store.writePage({ title: second, body: "second", expectedUpdatedAt: null }),
    ).toThrow(store.PageExistsError);

    expect(rowsFor(first)).toBe(1);
    expect(store.readPage(second)?.body).toBe("first");
  });

  test("a page is found by any case variant of its title", () => {
    store.writePage({ title: "Sightseeing", body: "Livraria Lello", expectedUpdatedAt: null });

    for (const spelling of ["Sightseeing", "sightseeing", "SIGHTSEEING", "  SiGhTsEeInG  "]) {
      expect(store.readPage(spelling)?.body).toBe("Livraria Lello");
    }
  });

  test("readPage returns the stored spelling, not the caller's", () => {
    store.writePage({ title: "Shopping", body: "x", expectedUpdatedAt: null });
    expect(store.readPage("SHOPPING")?.title).toBe("Shopping");
  });

  // F-06. Every accented fixture above is precomposed, and two precomposed
  // strings fold alike whether or not pageKey normalizes. Only a decomposed
  // fixture makes the .normalize("NFC") step load-bearing in a test.
  test("a decomposed title is the same page as its precomposed form", () => {
    const precomposed = "Lubeck".replace("u", "\u00fc");
    const decomposed = "LUBECK".replace("U", "U\u0308");

    // Guard the fixture: if these ever fold alike the test is tautological.
    expect(decomposed).not.toBe(decomposed.normalize("NFC"));
    expect(decomposed.length).toBeGreaterThan(precomposed.length);

    store.writePage({ title: precomposed, body: "precomposed", expectedUpdatedAt: null });

    expect(() =>
      store.writePage({ title: decomposed, body: "decomposed", expectedUpdatedAt: null }),
    ).toThrow(store.PageExistsError);

    expect(rowsFor(precomposed)).toBe(1);
    expect(store.readPage(decomposed)?.body).toBe("precomposed");
  });

  test("an unknown title reads as null", () => {
    expect(store.readPage("Nothing Here")).toBeNull();
  });
});

// F-07. listPages had no test at all, so its documented ordering could not fail.
describe("listPages ordering", () => {
  test("returns the most recently updated page first", () => {
    store.writePage({ title: "Order A", body: "x", expectedUpdatedAt: null });
    store.writePage({ title: "Order B", body: "x", expectedUpdatedAt: null });

    const a = store.readPage("Order A")!;
    store.writePage({ title: "Order A", body: "y", expectedUpdatedAt: a.updatedAt });

    const titles = store.listPages().map((p) => p.title);
    expect(titles.indexOf("Order A")).toBeLessThan(titles.indexOf("Order B"));
  });

  test("the whole list is in non-increasing updated_at order", () => {
    const stamps = store.listPages().map((p) => p.updatedAt);
    expect(stamps.length).toBeGreaterThan(1);

    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i] <= stamps[i - 1]).toBe(true);
    }
  });
});

describe("read before write", () => {
  test("writing with the token readPage returned replaces the body in place", () => {
    store.writePage({ title: "Lisbon", body: "v1", expectedUpdatedAt: null });
    const read = store.readPage("Lisbon")!;

    store.writePage({ title: "Lisbon", body: "v2", expectedUpdatedAt: read.updatedAt });

    expect(store.readPage("Lisbon")?.body).toBe("v2");
    expect(rowsFor("Lisbon")).toBe(1);
  });

  test("a stale token is rejected and the stored body is untouched", () => {
    store.writePage({ title: "Porto", body: "v1", expectedUpdatedAt: null });
    const stale = store.readPage("Porto")!;
    store.writePage({ title: "Porto", body: "v2", expectedUpdatedAt: stale.updatedAt });

    expect(() =>
      store.writePage({ title: "Porto", body: "v3", expectedUpdatedAt: stale.updatedAt }),
    ).toThrow(store.StalePageWriteError);

    expect(store.readPage("Porto")?.body).toBe("v2");
  });

  // The guarantee this whole feature exists for. Before updated_at was forced
  // strictly increasing, 255 of 300 of these cycles silently accepted the
  // overwrite, because toISOString only has millisecond resolution.
  test("no stale write is accepted across 300 rapid cycles", () => {
    let accepted = 0;

    for (let i = 0; i < 300; i++) {
      const title = `Cycle ${i}`;
      store.writePage({ title, body: "v1", expectedUpdatedAt: null });
      const read = store.readPage(title)!;
      store.writePage({ title, body: "v2", expectedUpdatedAt: read.updatedAt });

      try {
        store.writePage({ title, body: "v3-stale", expectedUpdatedAt: read.updatedAt });
        accepted++;
      } catch (error) {
        if (!(error instanceof store.StalePageWriteError)) throw error;
      }
    }

    expect(accepted).toBe(0);
    const overwritten = store
      .getDb()
      .prepare("SELECT COUNT(*) AS n FROM pages WHERE body = 'v3-stale'")
      .get() as { n: number };
    expect(overwritten.n).toBe(0);
  });

  test("creating over an existing page names the stored spelling", () => {
    store.writePage({ title: "Expenses", body: "v1", expectedUpdatedAt: null });

    expect(() =>
      store.writePage({ title: "  eXpEnSeS  ", body: "v2", expectedUpdatedAt: null }),
    ).toThrow(/A page titled "Expenses" already exists/);
  });

  test("updating a title that does not exist is rejected", () => {
    expect(() =>
      store.writePage({
        title: "Never Created",
        body: "x",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow(store.StalePageWriteError);
  });

  test("an empty or whitespace-only title is rejected", () => {
    for (const title of ["", "   ", "\t\n"]) {
      expect(() => store.writePage({ title, body: "x", expectedUpdatedAt: null })).toThrow(
        /needs a title/,
      );
    }
  });
});

describe("updated_at", () => {
  test("strictly increases across rapid writes to one page", () => {
    let current = store.writePage({ title: "Transport", body: "v0", expectedUpdatedAt: null });
    const seen = [current.updatedAt];

    for (let i = 1; i <= 25; i++) {
      current = store.writePage({
        title: "Transport",
        body: `v${i}`,
        expectedUpdatedAt: current.updatedAt,
      });
      seen.push(current.updatedAt);
    }

    for (let i = 1; i < seen.length; i++) {
      expect(seen[i] > seen[i - 1]).toBe(true);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("messages", () => {
  test("insertion order survives colliding timestamps", () => {
    const before = store.listMessages().length;
    for (let i = 0; i < 40; i++) {
      store.appendMessage(i % 2 ? "assistant" : "user", `m${i}`);
    }

    const appended = store.listMessages().slice(before);
    expect(appended.map((m) => m.content)).toEqual(
      Array.from({ length: 40 }, (_, i) => `m${i}`),
    );
    expect(appended[0].role).toBe("user");
    expect(appended[1].role).toBe("assistant");

    // Ordering by created_at would be ambiguous: these do collide.
    expect(new Set(appended.map((m) => m.createdAt)).size).toBeLessThan(appended.length);
  });

  // F-07. The test above cannot tell ORDER BY id from ORDER BY created_at,
  // because every row is inserted in timestamp order anyway. This one can.
  test("order follows insertion, not the timestamp", () => {
    store.appendMessage("user", "inserted first, recent timestamp");

    // Higher id, deliberately older created_at. Ordering by created_at would
    // pull this ahead of the message above; ordering by id must not.
    store
      .getDb()
      .prepare("INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)")
      .run("assistant", "inserted second, ancient timestamp", "2000-01-01T00:00:00.000Z");

    const all = store.listMessages();
    const first = all.findIndex((m) => m.content === "inserted first, recent timestamp");
    const second = all.findIndex((m) => m.content === "inserted second, ancient timestamp");

    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
  });

  test("an invalid role is not mistranslated into a page error", () => {
    const before = store.listMessages().length;

    try {
      store.appendMessage("system" as "user", "rejected by the CHECK constraint");
      throw new Error("an invalid role was accepted");
    } catch (error) {
      expect(error).not.toBeInstanceOf(store.PageExistsError);
      expect(error).not.toBeInstanceOf(store.StalePageWriteError);
      expect((error as Error).message).toMatch(/CHECK constraint failed/);
    }

    expect(store.listMessages().length).toBe(before);
  });
});
