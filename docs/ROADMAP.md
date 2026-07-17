# Roadmap — Financial Planner

Keep this file current: mark items done, add decisions, park ideas under Backlog.
Statuses: `[ ]` todo · `[~]` in progress · `[x]` done.

## Phase 0 — Foundations (repos, scaffold, data plumbing)

- [x] Create GitHub repos: `TS6482/drazgresle` (public) + `TS6482/drazgresle-data` (private,
      verified). Pages enabled (workflow build); first deploy green; site live at
      <https://ts6482.github.io/drazgresle/>. *Husband's collaborator invite still pending
      (deferred by user).*
- [x] Seed data repo with empty schema files + 12 starter categories.
- [x] Scaffold Vite + React + TS (strict) app; Vitest; ESLint; `.gitignore` incl. `*.csv`;
      PWA manifest + icon (SVG only for now — PNG 192/512 parked in Backlog); phone-first base
      layout/design tokens. *(Opus, 2026-07-14; reviewed by Fable: tsc clean, 5/5 tests, build OK)*
- [x] GitHub Actions: build + deploy to Pages on push to `main`.
- [x] Token entry screen; validate token; store in sessionStorage.
- [x] `api/github.ts`: read/write JSON files with sha-based retry (§4 of ARCHITECTURE.md).
- [~] **Milestone check:** both users can open the Pages URL on their phones, install to home
      screen, enter their token, and see a value round-tripped to the data repo (visible as a
      commit). *(Site deployed and reachable; waiting on user's first token test; husband
      deferred. Note: write round-trip UI arrives with Phase 1 — token validation covers
      read access for now.)*

## Phase 1 — Net worth tracking

- [x] Accounts management UI — all types incl. property, pension products, other assets;
      mortgage account with loan params (rate, payment, fixation end); family-loan account
      with outstanding balance, payment month, and editable year → amount repayment plan
      (ARCHITECTURE.md §4a).
- [x] `engine/loan.ts`: amortization schedule + tests.
- [x] Quarterly snapshot entry: pre-filled from last snapshot + computed mortgage balance
      (editable); snapshot history editable/deletable; >92-day nudge on home.
- [x] Net worth over time chart (net line + stacked asset classes above zero, liabilities band
      below zero; dataviz palette validated light+dark). Recharts added (~554 kB bundle —
      code-splitting parked in Backlog).
- [x] Interim home screen: current net worth + snapshot prompt (replaced in Phase 2 by the
      "this month's money" home).
      *(All Phase 1: Opus implemented 2026-07-14; Fable review fixed 2 lint findings via agent;
      37/37 tests, tsc+eslint clean. Awaiting user's on-phone verification pass.)*

## Phase 2 — Income & expenses (CSV import, classification, budgets, cash)

- [x] **Gate:** 6 months of real Air Bank statement PDFs provided (Jan–Jun 2026).
      **Raiffeisenbank parked to Backlog** (user choice — RB is a lunch-money account only;
      transfers to the RB lunch account classify as Eating out via a rule seeded in the
      private data repo).
- [x] Parser: `airbank.ts` + `importHash.ts` + `classify.ts`/`suggestRule` over pdf.js text
      extraction (lazy `pdfjs-dist`, verified as a separate build chunk; module worker driven
      in-browser). Built + reconciled against all 6 sample PDFs (start+Σ==end, Σ+==Připsáno,
      Σ-==Odepsáno all match); synthetic test fixtures only. *(Phase 2b: Opus 2026-07-15,
      101/101 tests, tsc+eslint clean.)*
- [x] Import wizard (`#/import`): pick PDF → parse → dedupe (`importHash`, straddling months) →
      auto-classify (rules) → review with save-as-rule learning → commit (per-month writes +
      statement metadata). Buttons on Month + Home. *(Phase 2b.)*
- [x] Card-payment learning fix (user feedback 2026-07-15): transactions persist the bank's
      `bankType`; card rows learn **merchant rules** (`description contains`, extracted up to
      the first comma, pattern editable in review so "SHOP CITY 123…" → "SHOP"); review groups
      identical vendors into one decision with live propagation across the import; MonthView
      gains an explicit "Auto-classify N unclassified" retroactive re-apply (one write).
- [x] Inline category creation in the shared CategoryPicker ("+ New category…" opens a compact
      in-place form; slugified collision-safe id; saves via the structured merge and selects the
      result) — works mid-import without losing review progress, and in MonthView/AddCash too.
      *(User request 2026-07-15.)*
- [x] Correction = learning in MonthView (completes ARCHITECTURE §6): re-categorizing a bank
      row stages the change with the same "Always classify…" checkbox + editable pattern as
      import review; stored rows default to description/merchant patterns (counterparty may be
      the cardholder); `planRuleUpdate` retargets or outranks the old rule that misclassified
      the row (rules merge prepends new rules so newer intent wins); after saving, an explicit
      hint points at the Auto-classify button instead of silent re-classification.
- [x] Statement-driven balance for the **Air Bank** account (`statementSource` flag on
      checking/savings): latest imported statement's ending balance pre-fills its snapshot
      balance, editable, with a `from statement <date>` hint. *(Phase 2b.)*
- [x] Budgets: default monthly target per category + per-month overrides; actual-vs-budget in
      monthly summary. *(Phase 2a: Opus 2026-07-15, Fable-reviewed, 70/70 tests, deployed.)*
- [x] Cash quick-add: one-tap-from-home form for `source: cash` transactions (phone-first).
- [x] Performance pass (Fable review 2026-07-16, Opus-implemented): charts (Recharts) lazy-load
      behind height-matched Suspense placeholders + stable React vendor chunk — entry JS
      663→121 kB min (gzip 198→37.5); `React.memo` on both Month-view charts + memoized
      per-category transaction grouping (typing in rule/note inputs no longer re-renders
      charts/lists); `loadMonth` in-flight dedupe (no duplicate GETs); **bug fix:** an
      override-only budget no longer persists `defaultMonthlyHalere: 0` (which imposed a
      0 Kč ceiling on every other month) — field now optional, +2 regression tests (173 total).
      Real budgets.json checked: no stale 0-defaults, no migration needed.
- [x] Transfers as a collapsed group card (user request 2026-07-16, confirmed via options
      form): the Month view's Transfers section is now ONE area-style accordion card —
      icon + "Transfers" + "Net …" header, tap to expand into the individual rows (inline
      editor intact). The show/hide switch and the `prefs.showTransfers` setting are
      removed (collapse replaces them; stale stored key ignored on read). Shared Toggle
      component kept for future settings.
- [x] ONE savings-transfer category + savings rate + own-account detection (user spec
      2026-07-17, two Q&A rounds): reserved `savings-transfers` category (group savings)
      replaces both "Bank transfer" and the reserved "Transfer" — own-account movements
      count NET in Saved; lunch top-ups are a normal expense (user: "categorize as eating
      out"); engine `savingsRate` (net saved ÷ income, may be negative/>100 %, null without
      income) shown on Month view + Home, a Phase 3 input; `Account.accountNumber` lets
      import review pre-fill rows to own accounts as savings transfers (editable, learns
      the account rule on commit). Transfers card removed from Month view. Data migrated
      (37 rows, 4 rules retargeted, 1 duplicate rule dropped; 2 misfiled rows left
      unclassified for the user). 177 tests.
- [x] Header removed (user request 2026-07-17): app chrome is now a floating frosted ⋯
      circle top-right (hidden on Settings) that opens Settings; username + Disconnect
      moved into a "Connection" section at the bottom of Settings; content and the
      read-only/error banners take over the safe-area inset handling. Budget-vs-actual
      figures on the Month view shrunk to text-sm so they stop crowding category names.
- [x] Liquid Glass settings button + content to top + swipe months (user requests
      2026-07-17): the ⋯ circle restyled as an Apple Liquid Glass lens (radial highlight,
      blur+saturate, specular inset edges, float shadows, press dip; dark-mode and
      no-backdrop-filter fallbacks); content now starts right below the notch and scrolls
      under the circle (Home's first button keeps 44px clearance since it's tappable);
      Month view pages by horizontal swipe on touch devices (guarded against text-cursor
      drags in form fields), arrows remain on desktop where a mouse can't swipe.
- [x] Month view (`#/month`): income/spent/net summary, budget bars with over-by warnings,
      transaction list with inline category edit; category management + salaries in Settings;
      new "this month's money" home; 4-tab navigation. *(Phase 2a.)*

## Phase 3 — Projections

- [ ] **Gate: verify current Czech employee tax/insurance rates, thresholds, taxpayer/child
      credits, and parental-allowance rules (web search: MFČR/ČSSZ/MPSV) before coding
      `tax/czech.ts`.** Year-keyed config, unit tests against hand-computed examples.
- [ ] `engine/projection.ts`: deterministic monthly projection incl. annual bonus months,
      mortgage payments/refixation-rate override, and family-loan plan-table repayments
      (scenario-overridable) + tests. Horizon 10–15 years.
- [ ] Parental-leave scenario model: salary pause, parental allowance, added child expenses,
      part-time return %, and start-year timing comparison (baseline vs multiple variants in
      one chart).
- [ ] Scenario editor UI + save/load to `scenarios.json`.

## Phase 4 — Calendar, hardening & polish

- [ ] Tax & deadlines calendar: seeded Czech deadlines (**verify current dates**), family-loan
      payment month auto-seeded, custom recurring deadlines, per-year done marks, upcoming
      items surfaced on home screen.
- [ ] Concurrent-edit conflict test (both users editing) and friendly error states.
- [ ] Data validation on load (schema check, helpful error if a JSON file is malformed).
- [ ] Short USER-GUIDE.md: token creation walkthrough, monthly import ritual, quarterly
      snapshot ritual.

## Backlog (explicitly not v1)

Monte Carlo · multi-currency · PSD2 bank connections · Czech UI translation · localStorage
"remember me" · AI classification · push notifications · OSVČ tax model · historical data
import.

## Decision log

- 2026-07-17 — Savings-transfer model finalized (user Q&A, 2 rounds): ONE reserved
  `savings-transfers` category for movements to/from own savings/investment accounts (net
  counts as Saved; a pass-through in+out cancels to 0 and never touches income/expense);
  withdrawals read NET; savings rate = net saved ÷ income incl. Investments, shown Month +
  Home, feeds Phase 3; own accounts recognized on import via optional `Account.accountNumber`
  (exact match, manual override) — chosen over fuzzy pattern-guessing; lunch-account top-ups
  are a plain expense per user ("I will just categorize it as eating out or groceries").
  Migration findings surfaced instead of guessed: a family payment ("Dražkovi", −15 000) and a
  go-kart card payment (−5 100) were misfiled as Transfer → left unclassified for the user.

- 2026-07-16 — Transfers revisited so "true saving" is visible (user chose "Both"): (a)
  transfers to the household **savings account** are now a **"Bank transfer" category (group
  savings)** — they count in Saved / the gauge Saved band, like Investments; rule repointed and
  25 existing rows across Jan–Jun reclassified. Lunch-account transfers stay plain Transfer.
  (b) A **toggleable "Transfers" section** below Saving in the Month view lists the remaining
  (excluded) transfer transactions; on/off state persisted in a new settings `prefs`.

- 2026-07-16 — Apple/iOS design language adopted (kept indigo, tuned to system indigo). Tokens
  → iOS system palette, SF type scale, true-black dark, 12px radii, frosted nav/tab bars; Month
  view restyled as inset grouped lists. Rolling out to other screens next.
- 2026-07-16 — Monthly **goal** feature (v1 = "money left" target only, extensible): a single
  recurring target for month-end leftover, **measured as income − spent − savings** (true
  leftover); shown below the gauge and on Home with met / over / under status. The gauge's
  "Left" number switches to this same leftover figure, and a neutral "Saved" segment is added to
  the arc so it stays coherent. Budget over/under progress bar shortened to a small indicator
  (was full-width and visually dominant).

- 2026-07-15 — Category system overhaul (user): (1) engine groups simplified to
  **income / expense / savings** (+ reserved transfer) — `fixed`+`variable` merged into
  `expense`, legacy values tolerated in code, data migrated. (2) New **overarching spending
  areas** layer — Essential Living, Food, Entertainment, **Kids (own group)**, Others — each
  expense category assigned to one (Investments/savings and Transfers stay separate, not
  spending areas). Month spending list groups under collapsible area headers with subtotals.
  (3) The income-allocation donut is **replaced by a horizontal "barometer" meter**: full width
  = month income, stacked colour segments = spending by area, centre number = "Left" (income −
  spent, positive or negative). allocation.ts/donut removed.

- 2026-07-15 — Per-month income-allocation **donut** in Month view (user request): slices
  Spent / Saved / Left over as shares of income (income total in the centre), colours echoing
  the net-worth chart. Edge cases (no income / overspent / savings withdrawn) show a
  plain-language line instead of a broken pie. `engine/allocation.ts` pure + tested.
  *(Written directly by Opus — session model switched to Opus mid-task after the delegated
  agent hit a session limit; model policy satisfied since Opus is the implementation model.)*
- 2026-07-15 — Savings are not spending (confirmed): month summary becomes
  **Income / Spent / Saved / Left over** (spent = fixed+variable only; saved = net put into
  savings-group categories, may go negative in a withdrawal month; leftover = income − spent −
  saved). Savings stay budgetable but a savings budget is a **target to hit** (shown positively,
  "✓ target reached"), never an over-budget problem. Month view splits budget-vs-actual into
  Spending / Saving; Budgets screen labels the section "Saving targets"; Home's budget bar
  tracks spending budgets only, with a compact "Saved X" line.

- 2026-07-15 — Savings-group categories (Investments etc.) no longer count as spending: month
  summary becomes **Income / Spent / Saved / Left over**; savings budgets are targets to hit
  (met = positive signal, never "over budget"); budget list splits into Spending and Saving
  sections. Confirmed with user after investments showed up inside Spent.

- 2026-07-15 — REVERSED the lunch-money decision after real use: transfers between Air Bank
  and the RB lunch account are now plain **Transfer** (both directions — statements showed the
  flow is mostly INTO Air Bank, which was distorting Eating out via refund netting). A second
  Transfer rule added for the user's other own Air Bank account. Consequence accepted by user:
  lunch spending is invisible in summaries (RB not imported). Data-repo rules + January rows
  fixed directly; transactions now persist `counterpartyAccount` so account rules work
  retroactively in the future.

- 2026-07-15 — Import format pivot: both banks are **PDF-only** (user verified apps + desktop
  IB). Importer switches from CSV/PapaParse to client-side PDF parsing via lazy-loaded
  `pdfjs-dist`; statements never leave the device; PDF start/end balances feed the Air Bank
  auto-balance. Samples = unmodified statement PDFs (impractical to anonymize; local-only).
- 2026-07-15 — Phase 2 design round: transfers between own accounts get a reserved 'Transfer'
  category — visible but excluded from income/expense totals and budgets, auto-taggable by
  rules. Non-salary incoming money (refunds/reimbursements) nets against its expense category
  (summaries show true monthly cost). Amount convention: signed halere, negative = outflow.
  Samples handed over via C:\ClaudeProjects\statement-samples\ (outside repo); light
  anonymization (names + account numbers; merchants/amounts may stay).

- 2026-07-15 — Theme: user disliked the green primary; picked **Indigo** from four validated
  candidates (light #4338ca / dark #8f8af1, contrast-checked both modes). Chart palette
  unchanged by user choice. App icon recolored to match.

- 2026-07-15 — Account-entry refinements (user request): (1) Air Bank checking balance becomes
  statement-driven in Phase 2 (ending balance from each imported statement pre-fills
  snapshots; RB stays manual); (2) property + other-asset accounts carry purchase price+date,
  the add form asks current value and writes it into today's snapshot, and the accounts list
  shows gain/loss vs purchase; (3) family-loan plan table live-computes running remainder per
  year + payoff/shortfall summary.

- 2026-07-14 — Phase 0 naming: app is called **"Dražgrešle"**; repos `drazgresle` (public app)
  and `drazgresle-data` (private data) — deliberately inconspicuous public URL. Husband's
  collaborator invite deferred until he has/shares a GitHub account. GitHub CLI route chosen
  for repo automation.

- 2026-07-14 — Two-repo split (public app / private data); Vite+React+TS; CZK-only integer
  halere; English UI; banks: Air Bank + Raiffeisenbank CZ; deterministic projections only.
- 2026-07-14 — Model policy: Fable plans/orchestrates/reviews, Opus writes all app code via
  `opus-implementer` agent.
- 2026-07-14 — User rule: always run clarifying-question rounds before any phase/feature;
  never start on partial context.
- 2026-07-14 — Requirements finalized (4 question rounds): goals = spending control + wealth
  growth + parental-leave decision + tax-deadline calendar (NOT retirement/FI). Fully joint
  finances; both employees; 2 statement sources; full mortgage loan model; pension products &
  other assets tracked; budgets = fixed default + per-month override; cash quick-add;
  phone-first PWA; home = "this month's money"; quarterly snapshots; ~10 coarse categories;
  annual bonus as % of salary in projections; 10–15y horizon; start fresh (no import);
  vendor-rule learning from corrections (future-only by default).
- 2026-07-14 — Phase 1 design: chart = total + stacked asset classes (per-account detail on
  tap); snapshot nudge on home after ~3 months, past snapshots editable; amounts displayed as
  Czech format "1 234 567 Kč" (whole crowns except transaction detail). Liability balances are
  entered/stored as positive "amount owed"; the engine subtracts by account type.
- 2026-07-14 — Family loan added (owed to husband's father): interest-free, known outstanding
  balance counted as a net-worth liability, one lump-sum payment per year in a fixed month
  (calendar reminder), amount freely editable per year via a year → amount plan table that
  projections use and scenarios can override.
