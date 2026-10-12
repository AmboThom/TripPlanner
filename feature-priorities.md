# Feature Priorities

**Status:** DRAFT — awaiting review
**Step:** 3 of 5
**Traces to:** `features.md` (APPROVED)

---

## Read this first: the cut line isn't where you think it is

Step 2 rejected every feature that didn't trace to a use case. That means the
eleven survivors are *already* close to minimal — there isn't much fat left to
cut, and dropping any of them costs you a whole use case.

So the interesting decision at this step isn't **which features ship**. It's
**how good each one has to be.** Three of them (F-04, F-06, F-08) have a cheap
version and an expensive version that look identical in a feature list and are
weeks apart in practice. That's where V1 gets decided.

---

## Difficulty, on two axes

Effort and risk are different things, and conflating them is how software
schedules go wrong. F-06 is about thirty lines of code and is the most dangerous
item on this list.

- **Effort** — how long to build the first working version.
- **Risk** — how likely it is to work in a demo and fail in real use.

| # | Feature | Effort | Risk | Note |
|---|---|---|---|---|
| F-01 | Chat with the bot | Low | Low | Solved problem. |
| F-02 | Conversation persists | Low | Low | Rows in a table. |
| F-03 | Extract trip facts | Low | **Med** | Code is trivial; judgment isn't. Over-capture ("that sounds nice" → a page entry) is the common failure. |
| F-04 | Categorize + consolidate | Low | **High** | Creating pages is easy. *Not* creating the fourth transport page is the hard part, and it degrades silently. |
| F-05 | Capture structure (cost/date/status) | **Med** | Med | The keystone — see below. |
| F-06 | Update, don't duplicate | Low | **High** | Highest-risk item in the product. See below. |
| F-07 | Chat + pages together | Low | Low | Layout. |
| F-08 | Pages update live | Low–**High** | Low | Depends entirely on which version. See below. |
| F-09 | Browse categories | Low | Low | A list. |
| F-10 | Running cost total | Low | Low | Free *if* F-05 exists. Impossible if not. |
| F-11 | Idea vs. confirmed | Low | Low | Free *if* F-05 exists. |

---

## The three features with two versions

### F-05 is the keystone — build it or lose F-10 and F-11

There's a fork here that decides the cost of half this list: **are pages prose, or
are they records?**

| | Pages as prose | Pages as records |
|---|---|---|
| Bot writes | A paragraph per page, rewritten as things change | Individual items with fields |
| F-06 (update) | Nearly free — rewriting the page *is* updating | Expensive — must identify *which* item the user means |
| F-10 (cost total) | **Impossible** — you can't sum a paragraph | Free — it's a sum |
| F-11 (idea vs. confirmed) | Weak — a word in a sentence | Free — it's a field |

Prose makes the risky feature cheap and the cheap features impossible. Records do
the reverse.

**Recommendation: both.** A page has a prose body *and* structured items attached,
but items are only created for things that have a cost or a date. Everything else
stays prose. That keeps F-10 alive, keeps F-11 honest, and limits the expensive
part of F-06 to a small set of items rather than every sentence on every page.

### F-06 — the cheap version is genuinely good enough for V1

Full version: the bot resolves "the flight moved to the 5th" to a specific stored
item and edits that item. Requires the bot to reliably match a vague human
reference to one record among many. This is where it fails: two flights on the
page, and it edits the wrong one.

Cheap version: the bot reads the whole page before writing and rewrites it. There
is no matching problem, because there's no identity to match — the page is just
correct afterward.

The cheap version is right for V1, with one caveat: it means **the bot must always
read before it writes.** That's not an optimization you add later; build it that
way from the first line or F-06 and F-04 both quietly break.

### F-08 — don't build the expensive version

Expensive: WebSockets, push, true real-time.
Cheap: after each bot turn finishes, refetch the pages.

The user is *in the conversation*. Updates only happen when the bot says
something. Refetching on turn completion is indistinguishable from real-time here,
and it's an afternoon instead of a week.

---

## Proposed V1

**This is a proposal. The cut line is yours.**

**In — the loop works end to end:**

| # | Feature | Version |
|---|---|---|
| F-01 | Chat with the bot | Full |
| F-02 | Conversation persists | Full |
| F-03 | Extract trip facts | Full |
| F-04 | Categorize + consolidate | Full — non-negotiable, it's load-bearing |
| F-05 | Capture structure | Hybrid: prose + items for anything with a cost or date |
| F-06 | Update, don't duplicate | **Cheap** — read-then-rewrite the page |
| F-07 | Chat + pages together | Full |
| F-08 | Pages update live | **Cheap** — refetch after each turn |
| F-09 | Browse categories | Full |
| F-10 | Running cost total | Full |

**Out — V2:**

| # | Feature | Why it waits |
|---|---|---|
| F-11 | Idea vs. confirmed | The only one I'd genuinely cut. It's cheap, but you don't yet know whether users confuse maybes with bookings. Ship without it and find out. |
| F-06+ | Item-level editing | Only needed once pages are long enough that rewriting them is lossy. You'll know when. |
| F-08+ | True real-time | Only needed if the bot gains a way to update pages outside a turn. It doesn't have one. |

Every V1 use case survives. UC-5 (collect maybes) still works without F-11 —
maybes get captured, they just aren't visually distinguished.

---

## To discuss: how much should difficulty influence priorities?

**It shouldn't decide *what* you build. It should decide *how well*.**

The failure mode people warn about — cutting valuable features because they're
hard — is real but rare. The common failure is the opposite: a feature list where
everything looks equally sized, so the hard thing gets the same two days as the
easy thing and ships broken.

Three rules I'd apply, in order:

1. **Never let difficulty cut a use case.** If a feature is the only thing serving
   an approved use case, it ships — you negotiate fidelity, not existence. F-06 is
   this case exactly: it's the riskiest item here and it ships anyway, just in its
   cheap form.

2. **Let difficulty pick the *version*.** This is where difficulty estimates earn
   their keep. F-06 and F-08 each have a cheap version that preserves the use case,
   and finding those is most of the value of this step.

3. **Treat risk as more important than effort.** Effort you can see — a thing takes
   three days instead of one and you notice. Risk you can't: F-04 degrades
   silently, looks perfect in a demo, and is unusable by week three. The items to
   watch are the High-Risk rows, not the High-Effort ones.

The sharpest question to ask about any estimate: *"if this takes three times as
long as you think, which use case do I lose?"* If the answer is "none," it's fine
to be wrong about it. For F-04 and F-06, the answer is UC-1 and UC-3 — which is
why they get the attention and F-09 doesn't.

---

## Your decisions

- [ ] Accept the V1 cut line, or move it?
- [ ] F-05 hybrid (prose + items with cost/date) — or commit fully to one?
- [ ] F-11 cut to V2 — agree?
- [ ] F-06 cheap version for V1 — agree, knowing it means "always read before write"?
- [ ] Approve → proceed to Step 4 (Technical Specification)
