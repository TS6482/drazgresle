// Schema types for the JSON files in the private data repo (see docs/ARCHITECTURE.md
// §4). All money values are integers in halere (CZK × 100); all dates are ISO
// `YYYY-MM-DD` strings. Every file carries a top-level `schemaVersion` so future
// migrations can branch on it.

/** ISO calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Which household member an account belongs to. Informational only — the
 *  household view is fully joint (see §0). */
export type AccountOwner = 'A' | 'B' | 'joint';

/** Every account kind the app understands. Liability kinds are the last three. */
export type AccountType =
  | 'checking'
  | 'savings'
  | 'investment'
  | 'pension'
  | 'property'
  | 'mortgage'
  | 'family-loan'
  | 'other-asset'
  | 'other-liability';

/**
 * Mortgage parameters, carried only by accounts of type `mortgage`. The balance
 * at any date is derived from these by engine/loan.ts; snapshots store the
 * computed figure too (audit trail + drift correction).
 */
export interface MortgageLoan {
  /** Outstanding principal at `principalAsOf`, in halere (positive = owed). */
  principalHalere: number;
  /** Date the `principalHalere` figure is accurate as of. */
  principalAsOf: IsoDate;
  /** Nominal annual interest rate, as a percentage (e.g. 4.9 → 4.9%). */
  annualRatePct: number;
  /** Fixed monthly payment (principal + interest), in halere. */
  monthlyPaymentHalere: number;
  /** Date the current interest-rate fixation ends. */
  fixationEnd: IsoDate;
}

/**
 * Interest-free family loan parameters, carried only by accounts of type
 * `family-loan` (see §4a). Repaid in one freely-chosen lump sum per year.
 */
export interface FamilyLoan {
  /** Outstanding balance at `asOf`, in halere (positive = owed). */
  outstandingHalere: number;
  /** Date the `outstandingHalere` figure is accurate as of. */
  asOf: IsoDate;
  /** Calendar month (1–12) the yearly lump-sum payment is made. */
  paymentMonth: number;
  /** Repayment plan: calendar year (as a string key) → planned amount in halere. */
  plan: Record<string, number>;
}

/**
 * What an asset originally cost. Meaningful only for `type === 'property'` or
 * `'other-asset'` accounts (see §4): entered once, then the UI shows gain/loss
 * against the latest snapshot value.
 */
export interface Purchase {
  /** Price paid, in halere. */
  priceHalere: number;
  /** Date of purchase. */
  date: IsoDate;
}

/** A single account in the registry. */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  owner: AccountOwner;
  /** Deactivated accounts are hidden from new snapshots but kept for history. */
  active: boolean;
  /** Present only when `type === 'mortgage'`. */
  loan?: MortgageLoan;
  /** Present only when `type === 'family-loan'`. */
  familyLoan?: FamilyLoan;
  /** Present only for `type === 'property'` or `'other-asset'`. */
  purchase?: Purchase;
  /**
   * When set, this account's balance is driven by imported bank statements
   * rather than typed in at each snapshot: the latest statement's ending balance
   * pre-fills its snapshot value (editable). Only `'airbank'` for now; meaningful
   * for `checking`/`savings` accounts (see docs/ARCHITECTURE.md §4).
   */
  statementSource?: 'airbank';
  /**
   * The account's own number as `"number/bankCode"` (e.g. `"1234567890/0800"`);
   * when set, imported statement rows whose counterparty account matches are
   * flagged as transfers to the household's own account.
   */
  accountNumber?: string;
}

/** `accounts.json`. */
export interface AccountsFile {
  schemaVersion: 1;
  accounts: Account[];
}

/**
 * A single quarterly net-worth snapshot. `balances` maps an account id to its
 * balance in halere on `date`. For liability accounts the stored value is the
 * positive amount owed; the engine subtracts it when computing net worth.
 */
export interface Snapshot {
  date: IsoDate;
  balances: Record<string, number>;
  note?: string;
}

/** `snapshots.json`. */
export interface SnapshotsFile {
  schemaVersion: 1;
  snapshots: Snapshot[];
}

// --- Categories (categories.json) --------------------------------------------

/**
 * Coarse spending group a category belongs to. `income` money comes in;
 * `expense` is spent (budgeted); `savings` is money put away; `transfer` is the
 * reserved group for money moved between the household's own accounts — excluded
 * from every income/spend total and from budgets (see §0 decision log).
 *
 * Legacy note: the app previously split spending into `'fixed'` and `'variable'`
 * groups, which the engine always treated identically. They were collapsed into
 * a single `'expense'` group. Old data (and the data repo, migrated separately)
 * may still store `'fixed'`/`'variable'`; every spending check treats those as
 * `'expense'` (see engine/summarize.ts `isExpenseGroup`), so this narrowed union
 * describes what the UI now writes, not every value that may be on disk.
 */
export type CategoryGroup = 'income' | 'expense' | 'savings' | 'transfer';

/** A single spending/income category. The reserved transfer category has id
 *  `'transfer'`; the engine also treats any category with `group: 'transfer'`
 *  as a transfer, so a missing reserved category degrades gracefully. */
export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
  /** Deactivated categories are hidden from pickers but kept — transactions
   *  reference ids, so a category is never deleted. Absent = active. */
  active?: boolean;
  /**
   * Which spending area (see engine/areas.ts) this category rolls up into, for
   * organizing/reporting the Month view — a `SpendingArea` id. Meaningful only
   * for expense categories; unset falls back to `'others'`. Ignored for
   * income/savings/transfer categories.
   */
  area?: string;
  /**
   * Tile icon for this category — an `ICON_LIBRARY` id (see
   * features/shared/icons). Unset falls back to the built-in default for the
   * category id, then a generic glyph (see engine/categoryIcons.ts).
   */
  icon?: string;
  /**
   * Tile colour for this category — an `ICON_COLORS` id (see
   * features/shared/icons). Unset falls back to the id default, then gray.
   */
  color?: string;
}

/** `categories.json`. */
export interface CategoriesFile {
  schemaVersion: 1;
  categories: Category[];
}

// --- Transactions (transactions/YYYY-MM.json) --------------------------------

/** Where a transaction came from: a bank statement, a cash quick-add, or a
 *  manual entry. */
export type TransactionSource = 'airbank' | 'rb' | 'cash' | 'manual';

/**
 * A single money movement. `amountHalere` is **signed** — negative is an outflow
 * (spending), positive is money in. `account` is an account id, or `''` for
 * cash. `categoryId` is `null` until classified.
 */
export interface Transaction {
  id: string;
  date: IsoDate;
  /** Signed integer halere; negative = outflow, positive = inflow. */
  amountHalere: number;
  counterparty: string;
  description: string;
  /** Account id this belongs to, or `''` for cash. */
  account: string;
  categoryId: string | null;
  source: TransactionSource;
  /** Hash of (date, amount, counterparty, raw description) for import dedupe. */
  importHash?: string;
  /**
   * The bank's transaction type as printed on the statement (e.g. "Platba
   * kartou"). Absent on cash/manual entries and on rows imported before this
   * field existed; classification treats a missing value as "not a card row".
   */
  bankType?: string;
  /**
   * The counterparty's account, normalized to `"1234567890/0800"`, when the
   * statement carried one — lets account-exact rules match STORED rows (e.g.
   * the retroactive Auto-classify). Absent on cash/manual entries and on rows
   * imported before this field existed; those cannot be backfilled (the data
   * is gone from the stored form) and simply never match account rules.
   */
  counterpartyAccount?: string;
  /**
   * The user's own note ("ask about this", "cash gift for X") — personal
   * context, never bank data. New cash quick-adds store their note here;
   * older cash entries kept it in `description` and display as before.
   */
  note?: string;
}

/**
 * Metadata for one imported statement, appended to the month file(s) its
 * transactions land in (see docs/ARCHITECTURE.md §6). The Air Bank auto-balance
 * (§4) reads `endingBalanceHalere` from the most recent such entry.
 */
export interface StatementMeta {
  /** Which bank produced the statement. Air Bank only for now. */
  source: 'airbank';
  /** Statement period start, ISO `YYYY-MM-DD`. */
  periodStart: IsoDate;
  /** Statement period end, ISO `YYYY-MM-DD`. */
  periodEnd: IsoDate;
  /** Balance before the first transaction, signed halere. */
  startingBalanceHalere: number;
  /** Balance after the last transaction, signed halere — feeds the snapshot. */
  endingBalanceHalere: number;
  /** Statement account number, "number/bankCode". */
  accountNumber: string;
}

/** One month's transactions file, `data/transactions/YYYY-MM.json`. */
export interface MonthFile {
  schemaVersion: 1;
  transactions: Transaction[];
  /** Imported-statement metadata whose period touches this month (optional). */
  statements?: StatementMeta[];
}

// --- Rules (rules.json) ------------------------------------------------------

/** Which transaction field a rule tests. */
export type RuleField = 'counterparty' | 'description' | 'counterpartyAccount';

/** How a rule's `pattern` is compared against the field (case-insensitive). */
export type RuleMatch = 'exact' | 'contains';

/**
 * A vendor→category rule. `counterpartyAccount` rules are always `exact`. On
 * import, `exact` rules win over `contains`; within a match type the first rule
 * in the file wins (see engine/classify.ts). `createdFrom` records the
 * transaction description the rule was suggested from, for later display.
 */
export interface Rule {
  id: string;
  field: RuleField;
  match: RuleMatch;
  pattern: string;
  categoryId: string;
  createdFrom?: string;
}

/** `rules.json`. */
export interface RulesFile {
  schemaVersion: 1;
  rules: Rule[];
}

// --- Budgets (budgets.json) --------------------------------------------------

/**
 * A category's budget: an optional default monthly target with optional
 * per-month overrides keyed by `"YYYY-MM"`. An override wins over the default for
 * that month (see `budgetFor` in engine/summarize.ts). A budget may set only
 * overrides and no default — months without an override then have NO budget
 * (null), not a 0 Kč ceiling.
 */
export interface CategoryBudget {
  defaultMonthlyHalere?: number;
  overrides?: Record<string, number>;
}

/** `budgets.json`: category id → its budget. */
export interface BudgetsFile {
  schemaVersion: 1;
  budgets: Record<string, CategoryBudget>;
}

// --- Settings (settings.json) ------------------------------------------------

/** Which household member — matches Account owner labels A/B. */
export type PersonId = 'A' | 'B';

/** One household earner's salary facts (used later by projections). */
export interface Person {
  id: PersonId;
  name: string;
  grossMonthlySalaryHalere: number;
  /** Annual bonus as a percentage of gross annual salary. */
  annualBonusPct: number;
}

/**
 * Household-level goals stored in settings.json. v1 carries only the monthly
 * leftover target, but it is modeled as an object so more goal types can be
 * added later without a schema bump.
 */
export interface HouseholdGoals {
  /** Target minimum leftover (income − spent − saved) to keep each month, in
   *  halere. Absent = no monthly goal set. */
  monthlyLeftoverHalere?: number;
}

/**
 * Household-level UI preferences stored in settings.json. Currently empty — no
 * preferences are stored — but kept as a small extensible bag (like
 * `HouseholdGoals`) so toggles can be added later without a schema bump. When a
 * field is added, redeclare this as an `interface` with optional members; every
 * such field falls back to its default when absent. Modeled as
 * `Record<string, never>` rather than an empty `interface` so it does not trip
 * `@typescript-eslint/no-empty-object-type`. A stale key left in settings.json
 * (e.g. an old `showTransfers`) is ignored on read.
 */
export type HouseholdPrefs = Record<string, never>;

/** `settings.json`. Seeded empty as `{persons: [], projectionDefaults: {}}`. */
export interface SettingsFile {
  schemaVersion: 1;
  persons: Person[];
  projectionDefaults: Record<string, number>;
  /** Optional household goals (see §0). Absent when none is set. */
  goals?: HouseholdGoals;
  /** Optional household UI preferences. Absent when all defaults apply. */
  prefs?: HouseholdPrefs;
}
