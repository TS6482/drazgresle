# Lessons learned — Financial Planner

Distilled from the project's first build sprint (2026-07-14 → 2026-07-17: Phases 0–2, ~42
commits, 5 → 180 engine tests). **Read this at the start of every session alongside CLAUDE.md**,
and before planning any new phase or feature.

Maintenance: when a new lesson emerges, first check whether an existing note already covers it —
**update that note rather than creating a duplicate**, and **delete notes that turn out to be
wrong** or are overtaken by later decisions. Date new or changed entries. This file should stay
a short, current distillation, not an append-only log.

## 1. Real data and real devices invalidate assumptions — test there first

Every major pivot came from contact with reality, not from review of the plan:

- **PDF-only banks.** The architecture assumed CSV import; the user checked both banking apps and
  neither exports CSV. Caught *before* parser code was written because we asked for real sample
  files first. → **Never write a parser or importer before holding real sample files** (kept
  outside the repo).
- **Czech decimal comma.** `type="number"` silently blocked all decimal input on the user's
  iPhone. Desktop verification could never have caught it. → Now a CLAUDE.md rule.
- **Cardholder vs. merchant.** Classification rules learned from the "counterparty" field, which
  for card payments is the *cardholder's own name* — rules were useless until re-keyed on the
  merchant string. → **Question the semantics of every bank-format field**; don't trust field
  names.
- **Lunch-money reversal.** A classification decision (transfers to the second bank = Eating out)
  was reversed after real statements showed the flow ran mostly the other way. → Money-semantics
  decisions are provisional until validated against a real month of data.
- **Responsive CSS by arithmetic failed twice.** Reasoning about widths without rendering left
  fields overlapping on the phone through two fix rounds. → Verify layout in a real phone-width
  viewport, or make overlap impossible by construction (stack below a breakpoint).
- **Number overflow in custom visuals** (gauge center, "Left" label) recurred. → Test every
  number display at realistic magnitudes: six-digit CZK amounts, not "1 234".

## 2. Clarifying questions work — but visual ideas need pictures, not words

The "never assume, never start on partial context" rule demonstrably reduced rework everywhere it
was applied (requirements, family loan, savings model, iOS restyle scope). The one notable miss:
the user asked for a "barometer" and got a horizontal bar, when they pictured an **arched gauge**
with the remaining amount under the arch — a full rebuild.

→ For anything visual (chart shapes, layouts, animations), words are not enough. Confirm with an
ASCII sketch, an AskUserQuestion preview, or a tiny throwaway mock **before** building. The
biggest rework clusters (month visualization changed four times; transfers UI three times) were
exactly the things hardest to specify verbally.

## 3. Money-classification semantics need a single source of truth

Income / expense / saving / transfer semantics took three redesign rounds across three days
(excluded transfers → toggleable transfers → one `savings-transfers` category + savings rate).
The user audits the numbers and catches any inconsistency with earlier agreements ("didn't we say
investments are saving?").

→ Record every money-semantics decision in ARCHITECTURE/ROADMAP the moment it's made, keep one
engine-level source of truth (e.g. `isExpenseGroup`), and when a new feature touches money
meaning, re-read the recorded decisions first. Expect that a real month of statements may still
overturn the model — design for migration (the engine's legacy-data tolerance made each rework
safe).

## 4. Privacy: the near-miss that must never repeat

While building the parser against real statements, generated code quoted real account numbers,
names, and merchant strings in comments and test fixtures. Caught in Fable review before any
commit. The rule is now in CLAUDE.md: **fixtures must be obviously invented; grep the repo for
statement-derived strings before every parser/test commit.** Post-task sweeps are routine. Treat
any code-writing task that touches real samples as high-risk and review for leakage explicitly.

## 5. Workflow patterns that earned their keep

- **Fable-review gate over `opus-implementer` output** caught the privacy leak, a
  zero-default budget bug (an override-only budget silently persisted a 0 Kč ceiling for all
  months), and lint gaps. Never skip the review pass.
- **Engine purity + a Vitest file paired with every engine module** (100% pairing, count tracked
  per commit) is what made three semantic reworks cheap and safe. Keep it absolute.
- **Reconciliation as acceptance criterion** (statement start + Σ transactions = end, to the
  halér, across all samples) is the gold standard for parser correctness — reuse for any future
  bank parser.
- **Small, verifiable batches** at the user's pace ("Accounts first") beat big-bang rollouts.
- **Propose-then-wait**: when the user says "don't do anything yet, is it possible to…", answer
  with plain-language trade-offs and wait for the go. Pushback with reasons is welcomed and
  usually accepted (4-slice pie refused; plugin risk explained honestly).
- **Build-then-delete is an accepted cost**, not a failure: swipe navigation + slide animation
  were built and removed the same day after on-device testing. The user evaluates by *using*,
  not by reading specs — keep iterations small so deletions stay cheap.
- **Explain cold-start behavior up front.** The user thought import auto-classification was
  broken because the rules database legitimately starts empty. Any learning/derived feature needs
  a plain-language "first time, it will look like this" note in the deploy summary.

## 6. Working with this user (communication)

- Plain language, jargon defined; they read the outcome summary, not the code. Best-received
  format: **what changed / what to check on your phone / what I need from you**.
- They test on their actual iPhone after every deploy and report precise findings — always end a
  deploy note with a short device-check list.
- Exact copy-paste commands for anything user-side (and on this Windows machine, verify freshly
  installed CLIs actually resolve on PATH — `gh` didn't after winget install).
- Strong, iterative visual taste. Ad-hoc styling read as "generic AI design"; adopting a coherent
  named design language (Apple/iOS HIG, indigo accent) landed immediately ("much better"). Stay
  inside that language for all new UI.
- They think in terms of an uninterrupted monthly workflow: inline, in-context actions (create a
  category mid-import, learn-from-correction in Month view, notes on transactions) are the
  pattern they ask for repeatedly.
- Terse approvals ("go", "yes lets do it") mean proceed; one feature request per message is
  normal; AskUserQuestion with a recommended-first option works well.

## 7. Process hygiene

- **Incidents become dated rules immediately** — the decimal-comma fix added its CLAUDE.md rule
  in the same commit. Keep doing this; add new lessons to this file the day they happen.
- **No `git add -A`** — it once swept a stray file into a commit (ironically, an empty
  `lessons.md`). Stage files explicitly.
- **Very long sessions degrade**: one marathon session hit `/compact` and a subagent died on
  session limits mid-task, forcing a pragmatic model switch. Prefer finishing a feature, updating
  ROADMAP, and letting the user start fresh over pushing a session past its limits.
- **Czech tax rates are never written from memory** — Phase 3 is gated on web-verifying current
  rates; config is year-keyed with `verifiedOn` dates.

## Standing open items (as of 2026-07-17)

Phase 0/1 await the user's on-phone verification passes; husband's collaborator invite deferred.
Phase 3 (projections + Czech tax engine) not started — rate verification gate applies. Backlog:
second bank's parser (parked by user), PNG PWA icons. See ROADMAP.md for the authoritative list.
