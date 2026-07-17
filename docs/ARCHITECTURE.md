# Architecture — Financial Planner

Status: requirements fully defined 2026-07-14 across four clarifying-question rounds with the
user. Decisions here are confirmed — change them only with the user's agreement and record the
change here and in the ROADMAP.md decision log.

## 0. Goals (what the app is FOR)

Confirmed purposes, in the user's priority order for the home screen:

1. **Where does money go?** — statement import, classification, monthly spending vs budget.
2. **Are we growing wealth?** — net worth trend across everything the household owns/owes.
3. **Can we afford kids / parental leave?** — projections built to answer this specific
   decision, including comparing different start years.
4. **Never miss a tax deadline** — a simple financial calendar (property tax, income tax
   return, custom deadlines).

Explicitly NOT goals: FI/early-retirement modeling, Monte Carlo, multi-currency, other
countries' taxes, automatic bank connections, AI classification.

Household facts that shape the design: finances are **fully joint** (one household view; owner
labels informational only); **both are employees** (no OSVČ tax model needed); **two statement
sources** per month (one Air Bank + one Raiffeisenbank CZ account); each receives an **annual
bonus as a known % of salary**; there is an **interest-free family loan** (owed to husband's
father) repaid in one lump sum per year of a freely chosen amount (see §4a); usage is
**phone-first**; snapshots **quarterly**; starting **fresh** (no historical import).

## 1. System overview

A fully client-side single-page app. There is no server of ours anywhere.

```text
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  financial-planner (PUBLIC)  │         │ financial-planner-data       │
│  React app source            │         │ (PRIVATE)                    │
│  GitHub Actions → Pages      │         │ JSON files only              │
└──────────────┬──────────────┘         └──────────────▲───────────────┘
               │ serves static UI                       │ GitHub Contents API
               ▼                                        │ (fine-grained PAT per user)
        Browser (user / husband) ───────────────────────┘
        token in sessionStorage only
```

- **Why two repos:** GitHub Pages sites are always publicly reachable, and Pages on a private
  repo needs a paid plan. The public repo contains only code (no data), so publishing it is
  safe and free. All financial data lives in the private data repo and travels only over the
  authenticated API.
- **Both users** are collaborators on the private data repo; each creates their **own
  fine-grained personal access token** scoped to *only* that repo with *Contents: Read & Write*
  permission (and nothing else). The app asks for the token on load and keeps it in
  `sessionStorage` (cleared when the tab closes). Optional later: "remember on this device"
  via localStorage, opt-in only.

## 2. Repos & deploy

| Repo | Visibility | Contents |
| --- | --- | --- |
| `financial-planner` | public | this working directory: app source, docs, CI |
| `financial-planner-data` | private | JSON data files (schema below), nothing else |

Deploy: GitHub Actions workflow in the app repo — on push to `main`: `npm ci && npm run build`
→ deploy `dist/` to Pages (official `actions/deploy-pages` flow). The user never runs a build.

## 3. Tech stack (deliberately minimal)

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite | standard, zero-config for React+TS |
| UI | React 18 + TypeScript (strict) | agreed with user |
| Charts | Recharts | declarative, fits React; use `dataviz` skill before chart work |
| CSV parsing | PapaParse | robust delimiter/quote handling |
| State | Zustand | tiny, no boilerplate |
| Routing | hash-based (`HashRouter` or hand-rolled) | Pages can't rewrite URLs to index.html |
| Tests | Vitest | engine modules must be tested |

**Phone-first (confirmed requirement):** every screen is designed for a phone viewport first
and scales up to desktop, not the reverse. The app ships a **PWA manifest + icons** so both
users install it to their home screens like a native app. Heavy flows (CSV import) must still
*work* on the phone — Air Bank/RB apps can export a statement on the phone itself.

No CSS framework decision yet — plain CSS modules with a small shared design-token file to
start; revisit only if it hurts.

## 4. Data model (files in the private repo)

All money values are **integers in halere** (CZK × 100). All dates ISO `YYYY-MM-DD`. Every file
has a top-level `schemaVersion: 1`.

```text
data/
  accounts.json          # registry: [{id, name, type, owner: A|B|joint, active, ...}]
                         # types: checking|savings|investment|pension|property|mortgage|
                         #        family-loan|other-asset|other-liability
                         # mortgage accounts carry loan params (see below); property carries
                         # a manually-estimated value updated at snapshots
                         # property + other-asset may carry purchase: {priceHalere, date} —
                         # entered once; the UI shows gain/loss vs the latest snapshot value.
                         # The Air Bank checking account is statement-driven from Phase 2 on:
                         # each imported statement's ending balance pre-fills its snapshot
                         # balance (editable, like the mortgage's computed value). The RB
                         # account stays manual by user choice (2026-07-15).
  snapshots.json         # quarterly net-worth snapshots:
                         #   [{date, balances: {accountId: halere}, note?}]
                         # mortgage balance is computed by the loan model but stored per
                         # snapshot too (audit trail + drift correction)
  categories.json        # ~10 coarse categories to start (user picked "start coarse"):
                         #   [{id, name, group: income|expense|savings, area?, icon?, color?}]
                         # (legacy groups fixed/variable/transfer still tolerated by the engine)
                         # Reserved id `savings-transfers` (group savings): the ONE category for
                         # transfers to/from the household's own savings/investment accounts —
                         # excluded from income/spending, counted NET in Saved (2026-07-17).
  rules.json             # vendor→category rules: [{id, field: counterparty|description,
                         #   match: contains|exact, pattern, categoryId, createdFrom?}]
  budgets.json           # per category: {categoryId: {defaultMonthlyHalere,
                         #   overrides: {"YYYY-MM": halere}}}   ← "fixed + override" model
  transactions/
    2026-07.json         # per month: [{id, date, amountHalere, counterparty, description,
                         #   account, categoryId|null, source: airbank|rb|cash|manual,
                         #   importHash}]  ← cash quick-adds land here with source: cash
  calendar.json          # recurring deadlines: [{id, title, rrule-lite (month+day or
                         #   month-window), kind: tax|custom, note}] + per-year done marks:
                         #   {doneKeys: ["2026:property-tax", ...]}
  settings.json          # per person: {name, grossMonthlySalaryHalere, annualBonusPct,
                         #   salaryGrowthPct}; projection defaults (inflation, investment
                         #   return, horizon); app prefs
  scenarios.json         # saved projection scenarios (see §7)
```

Notes:

- `snapshots.json` stays small at quarterly cadence — one file is fine for many years.
- Transactions are sharded per month to keep API payloads small and merges rare.
- `importHash` = hash of (date, amount, counterparty, raw description) → dedupe when the same
  statement is uploaded twice or exports overlap.
- **Savings transfers & savings rate (2026-07-17):** only the shared checking account's
  statements are imported. Money moved to/from the household's own savings/investment accounts
  is classified into the reserved `savings-transfers` category (or `investments`) — never
  income or expense — and the month's **savings rate** = net savings-group outflow ÷ income
  (engine `savingsRate`, shown on Month + Home; a Phase 3 scenario-planning input). Accounts
  may carry an optional `accountNumber` ("number/bankCode"); import review pre-fills a
  statement row whose counterparty account matches one as a savings transfer (manual override
  always possible, and confirming teaches the usual account-exact rule).

### Mortgage loan model (confirmed: full model, not manual balances)

The mortgage account stores: principal at a known date, annual interest rate, monthly payment,
and **fixation end date**. `engine/loan.ts` computes the amortization schedule (balance at any
month, interest/principal split). Snapshots record the computed balance; the user can correct
it if the bank's number drifts. Projections include the payment automatically and scenarios can
ask **"what if the rate is X% after refixation?"**. Property value stays a manual estimate
updated at snapshots.

### 4a. Family loan (confirmed requirement)

An **interest-free** loan from husband's father, repaid in **one lump sum per year, amount
freely chosen each year**. Modeled as a `family-loan` account:

- Fields: current outstanding balance (known), payment month, and a **repayment plan** — an
  editable `{year: halere}` table (e.g. 2026: 150 000 Kč, 2027: 100 000 Kč …). Each year's
  amount can be changed at any time. While editing, the table **live-computes the running
  remainder** after each year's payment plus a summary line ("fully repaid in 2031" / "still
  owing X after the last planned year"), so the user never has to do the math (2026-07-15).
- Counts as a **liability in net worth**, like the mortgage. Recording a payment (manual entry
  or matched from a statement) reduces the balance one-to-one; no interest math.
- **Projections always use the plan table**, deducting each year's planned amount in the
  payment month until the balance hits zero; **scenarios can override the plan** to compare
  strategies ("pay more next year vs spread it out") side by side.
- The payment month is seeded into the deadlines calendar (§8) so it surfaces on the home
  screen ahead of time.

### Concurrency / conflict handling

The Contents API update is compare-and-swap: every PUT must send the file's current blob `sha`.
If the other spouse saved first, GitHub returns 409 → the app re-fetches, **re-applies the local
change on top** (all our writes are structured merges: append snapshot, upsert transactions by
id, upsert rule/budget), and retries. Surface an error only if the same record was edited by
both.

## 5. App structure (public repo)

```text
src/
  api/github.ts          # Contents API client: getFile/putFile (base64, sha, retry-on-409)
  store/                 # Zustand stores: session (token), data cache per file
  engine/                # PURE TypeScript, no React, fully unit-tested
    money.ts             # halere arithmetic + CZK formatting
    parsers/airbank.ts   #   ── built against real anonymized samples (see §6)
    parsers/raiffeisen.ts
    classify.ts          # rule matching + rule creation/update from corrections
    summarize.ts         # monthly rollups + budget vs actual per category
    loan.ts              # mortgage amortization
    projection.ts        # deterministic multi-year projection (see §7)
    tax/czech.ts         # Czech employee gross→net, year-tagged config (see §7)
    calendar.ts          # deadline expansion (recurring rule → concrete dates per year)
  features/
    auth/                # token entry screen, token validation
    home/                # HOME SCREEN = "this month's money": spend vs budget so far,
                         # biggest categories, recent transactions, prominent
                         # "+ cash expense" quick-add; net worth & calendar one tap away
    networth/            # quarterly snapshot entry (pre-filled from last + loan model)
                         # + net-worth-over-time chart
    transactions/        # CSV import wizard → classify → monthly summary; cash quick-add
    budgets/             # category budget targets (default + per-month override)
    projections/         # scenario editor + trajectory chart (baseline vs scenarios)
    calendar/            # deadline list/year view, done-marking, custom deadlines
    settings/            # accounts, categories, salaries+bonus %, defaults
  App.tsx, main.tsx
```

Data flow: store loads JSON via `api/github.ts` → components read from store → mutations go
through store actions that write back via the API (optimistic UI, rollback on failure).

## 6. Statement import (PDF) & classification

Banks: **Air Bank** and **Raiffeisenbank CZ** — one account each, ~2 statements per month.
**Both banks offer statements only as PDF** (verified by the user in both mobile apps and
desktop internet banking, 2026-07-15), so the importer parses PDFs client-side:

- `pdfjs-dist` (Mozilla pdf.js) extracts text items with coordinates; per-bank parsers
  reconstruct transaction rows from the layout. Dependency approved 2026-07-15 for exactly
  this purpose; it must be **lazy-loaded** (dynamic import) so the main bundle stays small —
  the library loads only when the user actually imports a statement.
- Everything runs in the browser — statement PDFs never leave the device.
- PDF statements carry the starting/ending balance — the source for the Air Bank
  statement-driven snapshot balance (§4).
- CSV support can be added later if a bank ever exposes it; PapaParse stays out of the
  dependency list until then.

> **Implementation gate:** parsers are written against *real sample statement PDFs* the user
> provides at Phase 2b start (PDFs are impractical for a user to anonymize — they are read
> locally to build the parser, live outside the repo, and are never committed). Do not guess
> PDF layouts from memory.

Import wizard flow:

1. Upload file → detect bank → parse → dedupe against existing months via `importHash`.
2. Auto-classify via `rules.json` (first match wins; `exact` before `contains`).
3. Review screen: unclassified transactions on top; user picks category; app offers
   "always classify *MERCHANT* as X?" → saves a rule.
4. Commit: write month file(s) + any new rules; show monthly summary vs budget.

**Correction = learning (confirmed requirement):** when the user re-categorizes any
already-classified transaction — during review or later in the monthly view — the app offers to
create/update the vendor's rule so **all future imports** of that vendor go to the new
category. (Retroactive re-classification of past months is offered as an explicit optional
step, never automatic.)

**Cash & manual entries (confirmed requirement):** a quick-add form (amount, category, optional
note/date) reachable in one tap from the home screen, storing `source: cash` transactions into
the current month's file. Designed for the phone.

## 7. Projection engine & Czech tax preset

Pure function: `project(assumptions, scenario) → monthly series` (net worth, income, expenses,
savings), deterministic, monthly steps. **Horizon: 10–15 years** (user-selectable within that
range; confirmed — not a retirement tool). Monte Carlo is an explicit non-goal.

Assumptions (editable, defaults from settings.json):

- Per-person gross salary + annual growth %.
- **Annual bonus per person as % of gross annual salary (confirmed requirement)** — applied in
  its payout month, taxed through the same gross→net engine.
- Monthly expenses (seeded from actual category averages once data exists) + inflation %.
- Investment return % (annual, applied monthly), mortgage from the loan model (§4), incl.
  post-fixation rate scenarios.
- Family-loan repayments from the plan table (§4a), overridable per scenario.
- Starting balances from the latest snapshot.

**Parental-leave scenario (v1 core requirement, all four confirmed):** a scenario is a list of
timed overrides supporting —

1. Salary pause: person X gross → 0 from month M for N months.
2. **Parental allowance** (rodičovský příspěvek) as replacement income during the pause.
3. **Added child expenses**: a recurring expense block starting at birth, persisting after
   leave ends.
4. **Part-time return**: after leave, person X returns at a chosen % of salary for N years
   before full salary resumes.
5. **Timing comparison**: run the same scenario template with different start years and chart
   the trajectories side-by-side against baseline.

**Czech tax preset** (`engine/tax/czech.ts`) — employee model only (both are employees):

- Employee social insurance and health insurance (% of gross).
- Income tax: two bands (15% / 23% above the 36×-average-wage annual threshold) — bonus months
  can cross bands, so tax is computed on annualized income, not month-by-month naively.
- Taxpayer credit (sleva na poplatníka); optional child credits; parental allowance amount and
  drawing rules for scenarios.
- All rates/thresholds live in a year-keyed config object tagged `verifiedOn: <date>`.
  **Rates named here are from model memory — Opus must verify current values (web search:
  MFČR/ČSSZ/MPSV) during Phase 3 implementation before encoding them.**

## 8. Tax & deadlines calendar (confirmed requirement)

A lightweight yearly calendar of recurring financial deadlines so nothing is forgotten:

- Seeded Czech defaults (verify exact current dates at implementation): property tax payment
  (daň z nemovitosti, ~31 May), property tax declaration (only after buying/changing property,
  ~31 Jan), income tax return windows (paper / electronic / with advisor), employer annual
  tax settlement request (~mid-Feb).
- The family-loan payment month (§4a), seeded automatically from the loan account.
- User-defined custom recurring deadlines (e.g. insurance renewals).
- Each deadline can be marked done per year; upcoming items surface on the home screen when
  within ~30 days. No push notifications in v1 (static app) — visibility on open is the
  mechanism.

## 9. Security rules (non-negotiable)

- No financial data, tokens, or bank exports in the public repo — ever. `.gitignore` guards
  (`*.csv`, `samples/`, `.env*`) plus a documented review habit.
- Tokens: fine-grained PAT, single-repo scope, Contents R/W only, 1-year max expiry;
  sessionStorage only; sent only to `api.github.com`.
- The app must render a clear "read-only, token invalid/expired" state instead of failing
  silently.

## 10. Explicit non-goals for v1

Monte Carlo · multi-currency · other countries' taxes · OSVČ/self-employment tax model ·
automatic bank connections (PSD2) · push notifications · native mobile app (PWA is enough) ·
AI-based classification · historical data import (starting fresh).
