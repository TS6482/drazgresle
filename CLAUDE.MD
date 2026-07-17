# CLAUDE.md — Financial Planner

A personal finance app for two users (the user and their husband). Static React site on GitHub
Pages; **no backend** — data lives as JSON in a separate **private** GitHub repo, read/written
client-side via the GitHub Contents API with a personal access token (held in browser
sessionStorage only, never committed). Every save is a git commit = free version history.

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Phased plan & status:
[docs/ROADMAP.md](docs/ROADMAP.md) — **keep ROADMAP.md current as work progresses.**
Retrospective lessons: [docs/lessons.md](docs/lessons.md) — **read it before planning any
phase or feature, and add new dated lessons there when incidents or reworks happen.**

## The user

The user is an **amateur with little coding experience**. Consequences:

- Explain what you did and why in plain language; define jargon on first use.
- Never assume they can debug, run builds, or resolve git problems themselves — give exact
  copy-paste commands when their action is needed.
- Prefer boring, well-trodden solutions over clever ones. Minimize dependencies.
- When a decision genuinely needs their input, use an AskUserQuestion form with a recommended
  option first — don't present walls of prose options.
- **Never assume, never start on partial context (user rule).** Before starting any phase,
  feature, or design change, ask clarifying questions about goals and scope — in as many rounds
  as needed — until nothing material is assumed. Record confirmed answers in
  docs/ARCHITECTURE.md or the ROADMAP.md decision log.

## Model policy — MANDATORY

- **Planning, architecture, design review, and orchestration: Fable.**
- **All implementation code is written by Opus, exclusively.** When the session model is Fable,
  do NOT write or edit application code directly — delegate each implementation task to the
  `opus-implementer` agent (`.claude/agents/opus-implementer.md`), giving it the relevant
  ROADMAP phase, acceptance criteria, and pointers into docs/ARCHITECTURE.md. Review its output
  yourself (Fable) before reporting done.
- Docs, CLAUDE.md, roadmap edits, and reviews are not "code" — any model may edit those.

## Architecture guardrails (details in docs/ARCHITECTURE.md)

- Two repos: `drazgresle` (public, app code, this repo) and `drazgresle-data`
  (private, JSON data only). **No financial data, tokens, or sample bank statements may ever be
  committed to the public repo** — real statements are test-input only, kept outside the repo.
  This includes **code comments, doc examples, and test fixtures**: never quote real account
  numbers, names, employers, or merchant strings from the user's statements — fixtures must be
  obviously invented (caught in review 2026-07-15). Before every commit touching parser/test
  code, grep for statement-derived strings.
- Stack: Vite + React + TypeScript (strict). Charts: Recharts. CSV: PapaParse. State: Zustand.
  Routing: hash-based (GitHub Pages has no server rewrites). No other runtime deps without a
  reason recorded in ARCHITECTURE.md.
- All money in CZK, stored as **integer halere** (hundredths) to avoid float errors. UI English.
- **Phone-first**: every screen is designed for a phone viewport first (the app ships as an
  installable PWA); desktop is the adaptation, not the other way around.
- **Numeric inputs — never `type="number"`** (user-reported bug, 2026-07-15): Czech phone
  keyboards emit a decimal COMMA, which `type="number"` rejects. Every numeric field is
  `type="text"` with `inputMode="decimal"` (or `"numeric"` for true integers), parsed by a
  tested engine helper accepting both comma and dot (`parseKcInput`, `parsePercentInput`).
- Business logic (tax, projections, CSV parsing, classification rules) lives in pure TypeScript
  modules under `src/engine/` with **Vitest unit tests — required** for every engine change.
  UI components stay thin.
- Czech tax/insurance rates are config data in `src/engine/tax/czech.ts`, tagged with the year
  they were verified — never hard-code rates inline, and verify current rates (web search) when
  touching them.

## Workflow

1. Pick the next item from ROADMAP.md (or the user's request); confirm scope if ambiguous.
2. Fable writes/refines the task spec → delegates to `opus-implementer`.
3. Verify: engine work needs passing Vitest tests; UI work should be exercised via the `verify`
   skill (run the dev server, drive the flow) before calling it done.
4. Use the `dataviz` skill before writing any chart code.
5. Update ROADMAP.md status, then report to the user in plain language.
6. Commit only when the user asks. Never commit directly to `main` once the repo has a remote —
   use short-lived feature branches. Never commit secrets, tokens, or real bank data.
