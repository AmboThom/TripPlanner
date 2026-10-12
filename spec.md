# Technical Specification

**Status:** DRAFT — awaiting review
**Step:** 4 of 5
**Scope:** The 8-feature MVP from `feature-priorities.md`
(F-01, F-02, F-03, F-04, F-06-cheap, F-07, F-08-cheap, F-09)

---

## The whole thing in one paragraph

There is one screen. On the right, you chat. Every time you send a message, the
server hands the conversation to the AI along with three tools: *see what pages
exist*, *read a page*, *write a page*. The AI decides whether anything you said is
worth keeping, decides which page it belongs on, reads that page, and writes it
back with your new information folded in. When the AI finishes talking, the page
list on the left refreshes. That's the entire product.

---

## Architecture

```
┌──────────────────────── BROWSER ────────────────────────┐
│                                                          │
│   ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│   │  Page    │  │   Page       │  │      Chat        │  │
│   │  list    │  │   content    │  │                  │  │
│   └──────────┘  └──────────────┘  └──────────────────┘  │
│         ▲              ▲                   │             │
│         └──────┬───────┘                   │             │
│           GET /api/pages          POST /api/chat         │
└──────────────────┼─────────────────────────┼─────────────┘
                   │                         │
┌──────────────────┼─────────────────────────┼─────────────┐
│                  │      SERVER             │             │
│                  │                         ▼             │
│                  │              ┌──────────────────┐     │
│                  │              │   Chat handler   │     │
│                  │              └────────┬─────────┘     │
│                  │                       │               │
│                  │         ┌─────────────┴────────────┐  │
│                  │         │      tool loop           │  │
│                  │         │  list_pages / read_page  │  │
│                  │         │  / write_page            │  │
│                  │         └─────────────┬────────────┘  │
│                  │                       │               │
│            ┌─────▼───────────────────────▼─────┐         │
│            │           SQLite                  │         │
│            │    pages  ·  messages             │         │
│            └───────────────────────────────────┘         │
└──────────────────────────┼───────────────────────────────┘
                           │
                    ┌──────▼───────┐
                    │  Claude API  │
                    └──────────────┘
```

Everything runs in one process. One database file. No background jobs, no queue,
no cache, no second service.

---

## 1. Data

**Two tables.** That's the whole data model.

### `pages`
One row per category. The bot creates these; there is no fixed list.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | primary key |
| `title` | text, unique | The category name — *the bot chooses this* ("Flights", "Lisbon") |
| `body` | text | The page content, as markdown. The bot writes this whole field at once. |
| `updated_at` | timestamp | Drives "recently changed" in the sidebar |

`title` being **unique** is doing real work: it's what makes F-04 consolidation
enforceable. The bot cannot accidentally create a second "Flights" page.

### `messages`
The conversation. Replayed to the AI on every turn, and to the screen on load.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | primary key |
| `role` | text | `user` or `assistant` |
| `content` | text | What was said |
| `created_at` | timestamp | Ordering |

**Not in the MVP:** no entries table, no costs, no trips table, no users table.
Those arrive with F-05/F-10 — see the last section.

---

## 2. Screens

**One screen, three regions.** Familiar from ChatGPT/Claude, with the middle
region added because our sidebar holds documents rather than conversations.

### Nothing selected — chat gets the room

```
┌───────────────┬──────────────────────────────────────────┐
│  PAGES        │  CHAT                                    │
│               │                                          │
│  Flights      │   You: we're flying into Lisbon on the   │
│  Lisbon       │        3rd, $420 each                    │
│  Sightseeing  │                                          │
│  Expenses     │   Bot: Got it — added to Flights.        │
│               │        How long are you staying?         │
│  + as the bot │                                          │
│    creates    │  ┌────────────────────────────────────┐  │
│    them       │  │ Type a message...                  │  │
│               │  └────────────────────────────────────┘  │
└───────────────┴──────────────────────────────────────────┘
```

### A page selected — it opens *beside* the chat, never over it

```
┌───────────────┬─────────────────────────┬────────────────┐
│  PAGES        │  FLIGHTS            [×] │  CHAT          │
│               │                         │                │
│ ▸ Flights     │  ## Outbound            │  You: we're    │
│   Lisbon      │  LIS, 3rd — $420 pp     │  flying into   │
│   Sightseeing │                         │  Lisbon...     │
│   Expenses    │  ## Return              │                │
│               │  Not booked yet         │  Bot: Got it   │
│               │                         │                │
│               │  updated just now       │  ┌──────────┐  │
│               │                         │  │ Type...  │  │
└───────────────┴─────────────────────────┴────────────────┘
```

This is the layout doing the work of **UC-2**. Opening a page must never replace
the chat — the moment reading costs you the conversation, the product is a notes
app with a chatbot attached. The `[×]` closes the middle region and gives the
width back to chat.

**Behaviors**
- Page list is always visible, ordered by most recently updated.
- A page that changes during a turn flashes briefly in the list.
- If the open page is the one that changed, its content updates in place — the
  user watches it fill in. This is the product's best moment; don't lose it.
- Chat streams token by token, so the bot feels responsive while it's working.
- Empty state: no pages, and a prompt inviting the user to describe their trip.

---

## 3. Logic

### What happens when you send a message

```
  1. User types, hits send
         │
  2. Save the message ─────────────────────────► messages table
         │
  3. Load history + current page titles
         │
  4. Call Claude  ── system rules + history + 3 tools
         │
  5. ┌── AI wants a tool? ──────────────────────┐
     │      list_pages  → titles from DB        │
     │      read_page   → one page's body       │  repeat until
     │      write_page  → insert or replace     │  the AI is done
     │   run it, give the AI the result ────────┘
     │
  6. AI replies in words → streamed to the screen
         │
  7. Save the reply ───────────────────────────► messages table
         │
  8. Turn ends → browser refetches /api/pages   ◄── this is F-08
```

Step 8 is the entire "live update" feature. Pages only change when the bot acts,
and the bot only acts during a turn — so refreshing when the turn ends is
indistinguishable from real-time, at a fraction of the cost.

### The three tools

| Tool | In | Out | Serves |
|---|---|---|---|
| `list_pages` | — | Every page title + when it changed | F-04 |
| `read_page` | title | The page's full body | F-06 |
| `write_page` | title, body | Creates the page, or replaces its body entirely | F-04, F-06 |

Three tools, and only one of them writes.

### The rules the AI runs under

These live in the system prompt. They are not decoration — each one *is* a
feature from Step 2, and the product fails in a specific way without it:

1. **Don't capture everything.** Only concrete trip facts — decisions, bookings,
   costs, places, recommendations. Not pleasantries, not your own suggestions
   until the user takes them up. *(F-03. Without it, every "sounds good" becomes
   page content.)*
2. **Always `list_pages` before creating one.** Prefer an existing page whenever
   the fit is reasonable. *(F-04. Without it: "Rental Cars", "Car Rental" and
   "Transportation", one entry each.)*
3. **Always `read_page` before `write_page`.** `write_page` replaces the whole
   body, so writing without reading destroys whatever was there. *(F-06. This is
   the single most important line in the spec.)*
4. **Say what you filed.** A short note — "added that to Flights" — so the user
   can see the bot understood without opening the page. *(Trust.)*
5. **Ask when it matters.** One question at a time, only when a real detail is
   missing. *(It's a conversation, not an intake form.)*

Rule 3 deserves its own sentence: **the cheap version of F-06 is only safe
because of it.** Read-then-write is how "the flight moved to the 5th" updates the
page instead of wiping it.

### Endpoints

| Route | Does |
|---|---|
| `POST /api/chat` | Runs a turn. Streams the reply. |
| `GET /api/pages` | Page list for the sidebar. |
| `GET /api/pages/:title` | One page's content. |
| `GET /api/messages` | History, on load. |

---

## 4. Stack

| Piece | Choice | Why |
|---|---|---|
| App | Next.js + TypeScript | UI and API in one process, one deploy |
| Database | SQLite, one file | No server to run; the whole trip is one file you can copy |
| AI | Claude API, `claude-opus-5`, streaming | The tool loop is the product; this is the part worth quality |
| Tool loop | SDK's built-in tool runner | Don't hand-write the loop |

**Prerequisite:** an `ANTHROPIC_API_KEY`. Nothing in the chat path works without
it; the pages UI can be built and tested before it exists.

---

## 5. Where this is deliberately dumb

Named so nobody mistakes them for oversights:

- **The AI rewrites whole pages.** Simple and safe now. When pages get long
  this gets wasteful, and that's the moment F-05/F-06+ stop being optional.
- **One trip, hardcoded.** No trip table. A second trip means touching every query
  — a known one-way door, accepted deliberately.
- **No deletion.** If the bot files something wrong, you can only talk it into
  fixing it. Flagged in Step 2; still the most likely thing to bite you.
- **No auth, no sharing.** By decision, from Step 1.
- **Refetch, not push.** Correct while only the bot changes pages. Revisit if that
  ever stops being true.

---

## If you want F-05 + F-10 back

The cost total. Small and bounded — worth knowing exactly what it adds:

- **One table**, `entries` (`page_id`, `label`, `cost`, `date`, `status`)
- **One tool**, `add_entry`
- **One rule**: anything with a price also gets an entry
- **One query**: `SUM(cost)`, rendered at the top of the Expenses page

Two hours, roughly. The reason to decide *now* rather than later: entries only
exist from the day you add them, so a total built in V2 silently omits everything
captured before it. If you plan to use the MVP for a real trip, add it now.

---

## Your decisions

- [ ] Can you explain the diagram back in your own words? If not, tell me which
      part is murky and I'll simplify it — that's this step's actual test.
- [ ] Three-region layout right, or should a page open over the chat?
- [ ] F-05/F-10 in, or hold?
- [ ] Approve → proceed to Step 5 (Implementation)
