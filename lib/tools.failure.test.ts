import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, test } from "vitest";

// Its own database file, and its own module graph: this test breaks the store on
// purpose, which would poison every other test sharing a connection.
process.env.TRIP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trip-failure-")), "test.db");

let tools: typeof import("./tools");
let store: typeof import("./db");

beforeAll(async () => {
  store = await import("./db");
  tools = await import("./tools");
});

// F-11. storeGuidance hands the two known store errors back as text for the
// assistant to act on, and must rethrow everything else. If it returned any
// error as text, a broken store would read to the assistant like the retry
// guidance rule 6 tells it to follow, and it would retry against a store that can
// never succeed.
test("an unexpected store failure rejects instead of coming back as tool-result text", async () => {
  store.getDb().exec("DROP TABLE pages");

  // Wrapped in an async function so a synchronous throw and a rejected promise
  // are both observed as a rejection.
  const attempt = async () =>
    tools.writePageTool.run({ title: "Flights", body: "x", expected_updated_at: null });

  await expect(attempt()).rejects.toThrow(/no such table/);
});
