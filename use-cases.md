# Use Cases

**Status:** APPROVED (2026-09-21)
**Step:** 1 of 5
**Product:** A trip planner you talk to. You chat about your trip; it sorts what
you say into category pages (Flights, Locations, Expenses, ...) and keeps them
current while you keep talking.

---

## The core loop

Three things, happening at once:

1. The user chats with a bot about trip planning and details.
2. The bot categorizes what's discussed and writes it to the right page.
3. The user can look at any page at any time — without leaving the conversation —
   and see it current.

Everything below is a use case only because it serves one of those three.

---

## The user

**The planner-traveler.** One person planning a personal trip, over days or weeks,
in scattered sessions. Not a travel agent, not organized. A flight gets booked
Tuesday night; a restaurant gets recommended Thursday at lunch.

Single user. No collaborators, no auth.

**What defeats them today:** not planning the trip — *keeping track of what they
decided*. The trip currently lives across a notes app, a chat thread, and their
head.

---

## Use cases

### UC-1 — Say it, don't file it
**Trigger:** The user decides or learns something concrete. "We're flying into
Lisbon on the 3rd, $420 each."
**They do:** Say it in passing, in the words they'd use with a friend.
**Success:** It's on the Flights page. They never picked a category, opened a
page, or filled a field.
**Why it's real:** This is why the product exists. Notes apps lose here, because
notes require filing. The categorization is the bot's job, not the user's.

### UC-2 — Check a section without breaking the conversation
**Trigger:** Mid-chat, the user wants to see where something stands. "Hang on,
what's on Expenses?"
**They do:** Look at the page — then keep talking, same session, no context lost.
**Success:** Pages and chat are visible together. Reading one never costs you the
other, and a page the user is looking at updates as the conversation continues.
**Why it's real:** This is the interaction that distinguishes the product. If
browsing means leaving the chat, it's a notes app with a chatbot attached. If
they coexist, it's a conversation that builds a document in front of you.

### UC-3 — Change your mind
**Trigger:** Plans change. "Actually the flight moved to the 5th."
**They do:** Say the correction, conversationally.
**Success:** The existing entry is updated. There is not now a second flight on
the page.
**Why it's real:** Trips change constantly. If corrections duplicate instead of
update, pages rot within a week and the user stops trusting them — at which
point the product is a worse notes app. This is the use case most likely to kill
it if done badly.

### UC-4 — Know what it's costing
**Trigger:** Deciding whether to book one more thing.
**They do:** Look at Expenses.
**Success:** A running total reflecting everything captured so far.
**Why it's real:** Budget is the constraint that makes people abandon plans, and
it's the one question a chat transcript genuinely cannot answer.

### UC-5 — Collect maybes, not just bookings
**Trigger:** A recommendation arrives. "Someone said to check out Livraria Lello."
**They do:** Mention it.
**Success:** It lands on the right page as a candidate, not as a booking.
**Why it's real:** Most trip content is maybes. An app that only holds confirmed
things is empty for the first three weeks of planning — the exact weeks when
someone would be forming the habit of using it.

---

## Changed since v1

- **Promoted:** "Check a section without breaking the conversation" was a passive
  "see what's decided." Your review made the simultaneity explicit, which makes it
  a stronger and more specific requirement — it constrains the layout and it
  requires pages to refresh live. It's now UC-2.
- **Cut:** *UC-6, resume planning after a week away.* It described a moment, not a
  need — if UC-2 is done well, resuming is free. Say the word and I'll restore it.
- **Kept, with reason:** UC-5 stays separate from UC-1 rather than collapsing into
  it, because "maybe vs. booked" is a distinction the product will have to show,
  and that requirement would otherwise stay hidden until Step 4.

---

## Explicitly not use cases

Naming these so they don't creep in later:

- **Booking anything.** The app records decisions; it doesn't transact.
- **Finding flights or hotels.** No search, no live prices, no inventory.
- **Sharing with travel companions.** Single user, decided up front.
- **Use during the trip.** This is a planning tool. Day-of navigation, offline
  access, and "what's next on my itinerary" are a different product.

---

## To discuss: how do you know when you have enough use cases?

Three signals, in the order they show up:

1. **New ideas arrive as variations, not additions.** When "track visas" and
   "track vaccinations" both feel like UC-1 with a different noun, you've stopped
   finding use cases and started finding *content types*.
2. **Every use case would change the product if removed.** If cutting one costs
   nothing, it was description, not requirement. That's the test that cut UC-6.
3. **You can name who it's NOT for.** The "not use cases" list is the real evidence
   of a complete set — you can only draw a boundary once you know the shape.

Five is a reasonable number for a V1 this size. The risk here isn't missing a use
case; it's inventing users. A use case you can't attach to a specific moment in a
real person's week should be cut, not researched.

---

## Decisions (closed)

- [x] UC-6 stays cut
- [x] "Planner-traveler" confirmed as the user
- [x] No additions
- [x] Approved → Step 2 (Features)

**Ratified at approval:** Category names throughout this document (Flights,
Locations, Expenses, ...) are illustrative examples, not a fixed taxonomy. What
the real categories are — and who decides them — is a Step 2 feature question.
