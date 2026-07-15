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
- [x] Statement-driven balance for the **Air Bank** account (`statementSource` flag on
      checking/savings): latest imported statement's ending balance pre-fills its snapshot
      balance, editable, with a `from statement <date>` hint. *(Phase 2b.)*
- [x] Budgets: default monthly target per category + per-month overrides; actual-vs-budget in
      monthly summary. *(Phase 2a: Opus 2026-07-15, Fable-reviewed, 70/70 tests, deployed.)*
- [x] Cash quick-add: one-tap-from-home form for `source: cash` transactions (phone-first).
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
