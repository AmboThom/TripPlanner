# 🧳 Trip Binder

**A trip planner you talk to.**

Planning a trip isn't hard because people can't plan. It's hard because they can't keep track of what they already decided. The flight is in a chat thread, the hotel is in a notes app, and the restaurant is somewhere in your head.

Trip Binder makes filing the assistant's job. You chat about your trip. As you talk, the assistant sorts what you said into category pages (flights, locations, expenses, and whatever else it decides to call them) and keeps those pages current. You never file anything.

## Features

- **Chat about your trip.** Free-form, with replies streamed as they're written.
- **Pages that organize themselves.** The assistant names the categories and routes each fact to the right one. There's no fixed list.
- **Edits instead of duplicates.** "The flight moved to the 5th" updates the existing Flights page rather than adding a second entry.
- **Live updates.** When a reply finishes, new and rewritten pages appear without a reload, in place if you have that page open.
- **Read while you talk.** The page list is on the left, the open page in the middle, and the chat stays on the right. Opening a page never covers the conversation.
- **It remembers.** The conversation and the pages persist across sessions.

## Running the project

### Prerequisites

- Node.js 20.9 or newer (required by Next.js 16) and npm
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Install

```bash
git clone git@github.com:AmboThom/TripPlanner.git
cd TripPlanner
npm install
```

### 2. Add your API key

Create a file named `.env.local` in the project root with one line:

```bash
ANTHROPIC_API_KEY=your-key-here
```

Put the key on a single line, with no quotes or spaces around it. The file is gitignored, so the key stays on your machine. The server reads it at startup, so restart it after any change.

### 3. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and tell it about your trip, for example: *"We fly into Lisbon on the 3rd."* When the reply finishes, a page for it appears in the list on the left.

The database file (`data/trip.db`) is created automatically on first use.

### Run a production build

```bash
npm run build
npm run start
```

This also serves on port 3000.

### Run the tests

```bash
npm run test
```

Use `npm run test:watch` to re-run on every change, and `npm run lint` to run ESLint.

### Troubleshooting

| What you see in the chat | What to do |
|---|---|
| "ANTHROPIC_API_KEY is not set" | Check that `.env.local` is in the project root, then restart the server. |
| "The Anthropic API rejected the key" | The key is wrong or revoked. Paste it again. |
| "…contains a space, line break or other character…" | Re-paste the key on one line with no quotes. |
| "rate limiting this key" | The key is valid. Wait a moment and try again. |
| "The trip store could not be read or written" | Make sure the `data/` folder is writable. |

To start over with an empty trip, stop the server and delete `data/trip.db`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build (also runs the TypeScript check) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |

## How it works

Each chat turn runs the assistant with three tools:

- `list_pages` shows which pages exist.
- `read_page` returns one page.
- `write_page` replaces a page's body.

The assistant has to read a page before it writes it, and the store enforces that. This is what makes updates edits rather than duplicates, and the unique page title is what stops "Rental Cars", "Car Rental" and "Transportation" from becoming three pages.

**Stack**

- [Next.js](https://nextjs.org) 16 (App Router) and React 19, with TypeScript
- SQLite through `better-sqlite3`: one file, no ORM
- `@anthropic-ai/sdk` with `claude-opus-5`, streaming and using the SDK's tool runner
- `react-markdown` to render pages safely (no raw HTML, no images, unsafe links removed)
- Vitest

**Data.** Two tables in one SQLite file at `data/trip.db` (set `TRIP_DB_PATH` to move it):

- `pages` has one row per category: a unique `title`, a markdown `body`, and `updated_at`.
- `messages` holds the conversation, which is replayed to the assistant on every turn.

## Scope

Trip Binder is built for **one person planning one trip**. There's no sign-in and no sharing.

Not included, on purpose: booking anything, searching for flights or hotels, sharing with travel companions, and use during the trip itself. There's also no way to delete a page yet.

## What's next

- **Structured entries and a cost total.** Items with a cost or date behind the prose pages, and a computed total on the expenses page.
- **Idea vs. confirmed.** Mark whether something is a maybe or a booking.
