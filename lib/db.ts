import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_DB_PATH = "data/trip.db";

// A new connection on every dev hot reload leaves more and more open handles
// against the same file, so the handle is parked on globalThis.
const cache = globalThis as typeof globalThis & { tripDb?: Database.Database };

export function getDb(): Database.Database {
  if (cache.tripDb) return cache.tripDb;

  const file = resolve(process.env.TRIP_DB_PATH ?? DEFAULT_DB_PATH);
  mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  createSchema(db);
  cache.tripDb = db;
  return db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      title_key  TEXT NOT NULL UNIQUE,
      body       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY,
      role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * The folded form used for uniqueness and lookup. COLLATE NOCASE cannot do this
 * job: it folds ASCII A-Z only, so "Flüge" and "FLÜGE" would be two pages.
 */
function pageKey(title: string): string {
  return title.trim().normalize("NFC").toLowerCase();
}

export type PageSummary = { title: string; updatedAt: string };
export type Page = { title: string; body: string; updatedAt: string };

type PageRow = { title: string; body: string; updated_at: string };

export function listPages(): PageSummary[] {
  const rows = getDb()
    .prepare("SELECT title, updated_at FROM pages ORDER BY updated_at DESC, title ASC")
    .all() as Array<Omit<PageRow, "body">>;

  return rows.map((row) => ({ title: row.title, updatedAt: row.updated_at }));
}

export function readPage(title: string): Page | null {
  // Lookup goes through the folded key, so any case variant finds the page.
  const row = getDb()
    .prepare("SELECT title, body, updated_at FROM pages WHERE title_key = ?")
    .get(pageKey(title)) as PageRow | undefined;

  if (!row) return null;
  return { title: row.title, body: row.body, updatedAt: row.updated_at };
}

/** A write targeted a page whose stored state is not what the caller read. */
export class StalePageWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StalePageWriteError";
  }
}

/** A create was attempted for a title that already exists, cases included. */
export class PageExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageExistsError";
  }
}

export function writePage(input: {
  title: string;
  body: string;
  /** null means "create". Otherwise the value readPage returned. */
  expectedUpdatedAt: string | null;
}): Page {
  const title = input.title.trim();
  if (!title) throw new Error("A page needs a title; an empty one was given.");

  const db = getDb();

  if (input.expectedUpdatedAt === null) {
    const updatedAt = nextTimestamp(null);
    try {
      db.prepare(
        "INSERT INTO pages (title, title_key, body, updated_at) VALUES (?, ?, ?, ?)",
      ).run(title, pageKey(title), input.body, updatedAt);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Name the stored spelling, not the caller's. The assistant acts on this
        // message, so it has to point at the page that actually exists.
        const existing = readPage(title);
        throw new PageExistsError(
          `A page titled "${existing?.title ?? title}" already exists. Read it ` +
            `first, then write it back with the updatedAt value that read returned.`,
        );
      }
      throw error;
    }
    return readPage(title)!;
  }

  // The expectation lives in the WHERE clause, so the check and the write are
  // one statement and cannot interleave.
  const result = db
    .prepare(
      "UPDATE pages SET body = ?, updated_at = ? WHERE title_key = ? AND updated_at = ?",
    )
    .run(input.body, nextTimestamp(input.expectedUpdatedAt), pageKey(title), input.expectedUpdatedAt);

  if (result.changes === 0) {
    const current = readPage(title);
    if (!current) {
      throw new StalePageWriteError(
        `There is no page titled "${title}". List the pages to see what exists, ` +
          `then create it with expectedUpdatedAt set to null.`,
      );
    }
    throw new StalePageWriteError(
      `The page "${current.title}" changed since it was read. Read it again and ` +
        `write it back with the updatedAt value that read returns.`,
    );
  }

  return readPage(title)!;
}

/**
 * Strictly increasing per page. `updated_at` is the revision token, and
 * toISOString has millisecond resolution, so two writes in the same millisecond
 * would otherwise reuse a token and let a stale expectation match.
 */
function nextTimestamp(previous: string | null): string {
  const now = Date.now();
  if (previous === null) return new Date(now).toISOString();

  const parsed = Date.parse(previous);
  const next = Number.isNaN(parsed) ? now : Math.max(now, parsed + 1);
  return new Date(next).toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export type MessageRole = "user" | "assistant";
export type Message = { role: MessageRole; content: string; createdAt: string };

type MessageRow = { role: MessageRole; content: string; created_at: string };

export function appendMessage(role: MessageRole, content: string): Message {
  const createdAt = nextTimestamp(null);
  getDb()
    .prepare("INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)")
    .run(role, content, createdAt);

  return { role, content, createdAt };
}

export function listMessages(): Message[] {
  // Ordered by id, not created_at. Several messages can land in the same
  // millisecond, which would make a timestamp sort ambiguous; id is monotonic.
  const rows = getDb()
    .prepare("SELECT role, content, created_at FROM messages ORDER BY id ASC")
    .all() as MessageRow[];

  return rows.map((row) => ({
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));
}
