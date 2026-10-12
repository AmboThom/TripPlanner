# Features

**Status:** APPROVED (2026-09-21)
**Step:** 2 of 5
**Traces to:** `use-cases.md` (APPROVED)

Every feature below maps to a use case. Anything that doesn't trace is in the
Rejected section at the bottom, with the reason.

---

## Decided: the bot names the categories

**DECISION (2026-09-21): the bot decides.** Rationale and the risk it carries, below.

You said the category names are examples, not fixed. That has a consequence worth
deciding deliberately, because it's the difference between two different products:

| | Fixed taxonomy | Bot decides |
|---|---|---|
| **How it works** | App ships with N categories. Everything routes into one of them. | Bot creates categories as the trip reveals them. |
| **Good** | Predictable. Pages never fragment. User always knows where to look. | Fits any trip. A road trip gets Campsites; a wedding trip gets Events. |
| **Bad** | A trip that doesn't fit the list has a junk-drawer "Other" page. | "Rental Cars," "Car Rental," and "Transportation" become three pages with one entry each. |
| **Fails as** | Rigid | Fragmented |

**Chosen: bot decides — which makes consolidation a hard requirement, not a hope.**
The bot must check existing pages before creating a new one and prefer an
existing page when the fit is reasonable. That makes consolidation a *feature*
(F-04) rather than something we hope for.

This matters more than it looks. Fragmentation is a slow failure — it looks fine
on day one and the pages are unusable by week three. It's the same failure mode as
UC-3 duplication, and it deserves the same weight.

---

## Features

### Conversation

**F-01 — Chat with the bot** → UC-1
Free-form conversation about the trip. The user types how they'd talk to a friend;
no commands, no syntax, no forms.

**F-02 — Conversation persists** → UC-1, UC-3
The chat continues across sessions. Closing the app doesn't reset the trip.

### Capture

**F-03 — Extract trip facts from conversation** → UC-1
The bot recognizes when something said is a trip fact worth keeping ("flying into
Lisbon on the 3rd") versus conversational filler ("that sounds nice"). Not
everything said becomes content.

**F-04 — Categorize, and consolidate** → UC-1
The bot names and creates the categories itself — there is no fixed list. Each
captured fact is routed to a page. Before creating any new category, the bot must
read what pages already exist and prefer an existing one wherever the fit is
reasonable; a new category is created only when nothing fits.

*Load-bearing.* With no fixed taxonomy, consolidation is the only thing standing
between the user and a pile of near-duplicate pages. Treat "checks existing pages
first" as part of the feature, not as an implementation detail to be discovered
later.

**F-05 — Capture the details, not just the text** → UC-4, UC-5
A captured item carries its structure where it has one — cost, date, place, status
— not only a sentence. This is what makes F-09 and F-10 possible; without it,
totals and statuses are impossible after the fact.

**F-06 — Update rather than duplicate** → UC-3
When the user revises something already captured, the bot finds the existing item
and changes it. Saying "the flight moved to the 5th" must not leave two flights on
the page. *This is the highest-risk feature in the product.*

### Viewing

**F-07 — Chat and pages on screen together** → UC-2
Reading a page never costs the conversation. Both are visible; neither is a mode
you exit into.

**F-08 — Pages update live** → UC-2
A page the user is looking at reflects new information as the conversation
produces it, without a manual refresh.

**F-09 — Browse categories** → UC-2
See what pages exist and move between them.

### The specific pages

**F-10 — Running cost total** → UC-4
Expenses shows a total across everything captured with a cost, computed — not
something the bot has to remember and restate.

**F-11 — Idea vs. confirmed** → UC-5
A captured item is visibly one or the other. "Someone recommended Livraria Lello"
and "booked Livraria Lello tour, $30" are different things and must not look the
same on the page.

---

## Traceability

| Use case | Served by |
|---|---|
| UC-1 — Say it, don't file it | F-01, F-02, F-03, F-04 |
| UC-2 — Check a section without breaking the conversation | F-07, F-08, F-09 |
| UC-3 — Change your mind | F-02, F-06 |
| UC-4 — Know what it's costing | F-05, F-10 |
| UC-5 — Collect maybes | F-05, F-11 |

No orphans in either direction: every use case has at least one feature, and every
feature serves at least one use case.

---

## Rejected — does not trace to a use case

Each of these is a reasonable thing to want. None of them earns a place in this
document, because no approved use case needs it.

| Feature | Why rejected |
|---|---|
| Edit a page by hand | No use case has the user authoring content directly. The premise of UC-1 is that the *bot* files things. Worth revisiting only if the bot proves unreliable — and then it's a patch over a broken F-06, not a feature. |
| Search across pages | UC-2 is *browse*, not *find*. At five-to-ten pages, browsing is faster than searching. Becomes real at ~30 pages; this product doesn't have 30 pages. |
| Delete a page or entry | Nothing in the use cases says the user removes things. Likely a genuine gap — see "Your decisions." |
| Export / print / share | Sharing is explicitly not a use case. Export serves the trip itself, and "use during the trip" is out of scope. |
| Itinerary timeline / calendar | Tempting, and cross-cutting, but no use case asks "what happens on which day." That's a day-of question, which is out of scope. |
| Map view of locations | Pure appeal, zero traceability. |
| Multiple trips | Every use case is about *the* trip, singular. |
| Flight/hotel search, live prices | Explicitly not a use case. |

---

## To discuss: features that serve *future* use cases

The honest answer is **defer nearly all of them** — a feature for a use case you
haven't approved is a guess, and guesses you build are more expensive than guesses
you write down. But "defer" is not the same as "ignore," and the distinction that
matters is **which doors close**:

- **Reversible — just defer.** Search, export, map view, editing by hand. You can
  add any of these later at roughly the cost of building them later. Nothing about
  V1 makes them harder. No decision needed now.

- **One-way doors — decide now even though you won't build them.** These are
  cheap to accommodate today and expensive to retrofit:
  - **Multiple trips.** Deferring the *feature* is right. But if V1 assumes one
    trip so deeply that trip identity never exists anywhere, adding a second trip
    later means touching everything. Costs almost nothing to keep in mind now.
  - **Deletion.** If captured items can't be removed, a bot mistake is permanent,
    and a permanent mistake in a page the user trusts is worse than no page.
  - **Companions.** Currently out of scope by decision, not by accident. Fine to
    leave closed — just note that reopening it is expensive, so it should be a
    deliberate later choice rather than a surprise.

The rule I'd apply: **build only for approved use cases; spend a little thought,
and no code, on the one-way doors.** If you catch yourself building a feature
"because we'll need it," that's the signal to go add the use case to Step 1 and let
it get rejected there instead.

---

## Decisions (closed)

- [x] **Bot decides the category names** — consolidation (F-04) is therefore load-bearing
- [x] Deletion stays out of V1 (no use case backs it; revisit in Step 1 if it bites)
- [x] F-11 kept
- [x] No cuts
- [x] Approved → Step 3 (Complexity & Selection)
