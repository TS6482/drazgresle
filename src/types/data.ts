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
 * `fixed`/`variable`/`savings` are expense groups (spend, budgeted); `transfer`
 * is the reserved group for money moved between the household's own accounts —
 * excluded from every income/spend total and from budgets (see §0 decision log).
 */
export type CategoryGroup = 'income' | 'fixed' | 'variable' | 'savings' | 'transfer';

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
}

/** One month's transactions file, `data/transactions/YYYY-MM.json`. */
export interface MonthFile {
  schemaVersion: 1;
  transactions: Transaction[];
}

// --- Budgets (budgets.json) --------------------------------------------------

/**
 * A category's budget: a default monthly target with optional per-month
 * overrides keyed by `"YYYY-MM"`. An override wins over the default for that
 * month (see `budgetFor` in engine/summarize.ts).
 */
export interface CategoryBudget {
  defaultMonthlyHalere: number;
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

/** `settings.json`. Seeded empty as `{persons: [], projectionDefaults: {}}`. */
export interface SettingsFile {
  schemaVersion: 1;
  persons: Person[];
  projectionDefaults: Record<string, number>;
}
