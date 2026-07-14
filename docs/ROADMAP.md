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

- [ ] Accounts management UI — all types incl. property, pension products, other assets;
      mortgage account with loan params (rate, payment, fixation end); family-loan account
      with outstanding balance, payment month, and editable year → amount repayment plan
      (ARCHITECTURE.md §4a).
- [ ] `engine/loan.ts`: amortization schedule + tests.
- [ ] Quarterly snapshot entry: pre-filled from last snapshot + computed mortgage balance.
- [ ] Net worth over time chart (total + asset-class breakdown). Use `dataviz` skill.
- [ ] Interim home screen: current net worth + snapshot prompt (replaced in Phase 2 by the
      "this month's money" home).

## Phase 2 — Income & expenses (CSV import, classification, budgets, cash)

- [ ] **Gate: user provides anonymized sample CSV exports from Air Bank and Raiffeisenbank CZ.**
- [ ] Parsers: `airbank.ts`, `raiffeisen.ts` (windows-1250, header auto-detect) + tests.
- [ ] Import wizard: upload → parse → dedupe (`importHash`) → auto-classify → review → commit.
- [ ] Rules engine: correction of ANY transaction offers a vendor rule for future imports
      (+ optional retroactive re-apply). Category management (seed ~10 coarse categories).
- [ ] Budgets: default monthly target per category + per-month overrides; actual-vs-budget in
      monthly summary.
- [ ] Cash quick-add: one-tap-from-home form for `source: cash` transactions (phone-first).
- [ ] Final home screen — "this month's money": spend vs budget, top categories, recent
      transactions, quick-add button; net worth one tap away.
- [ ] Salary + annual bonus % for both persons in settings.

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
- 2026-07-14 — Family loan added (owed to husband's father): interest-free, known outstanding
  balance counted as a net-worth liability, one lump-sum payment per year in a fixed month
  (calendar reminder), amount freely editable per year via a year → amount plan table that
  projections use and scenarios can override.
