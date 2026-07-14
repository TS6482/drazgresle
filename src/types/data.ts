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
