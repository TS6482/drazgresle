// Monthly rollups: income / spend / saved, per-category net + budget-vs-actual.
// Pure — no React, no I/O. All amounts are signed integer halere (negative =
// outflow).
//
// Confirmed rules (docs/ROADMAP.md decision log, 2026-07-15):
// - Transfers between the household's own accounts (the reserved `'transfer'`
//   category, or any category with group `'transfer'`) are excluded from every
//   total and from budgets — they are money moving, not earned or spent.
// - Refunds/reimbursements net against their own category: a category's figure
//   is the *sum of signed amounts* in it, so a refund cancels part of the spend.
// - Unclassified transactions (categoryId null) are excluded from income/spend
//   and surfaced separately via `unclassifiedCount`.
// - Savings-group categories are NOT spending (confirmed 2026-07-15): money
//   moved to own investments stays visible and budgetable, but lands in the
//   separate `savedHalere` bucket, and its budget is a target to HIT (a floor),
//   not a ceiling — see `targetMet` vs `overBudget` on the rows.

import type { Category, CategoryBudget, CategoryGroup, Transaction } from '../types/data';

/** Map of category id → its budget (the `budgets` field of budgets.json). */
export type BudgetMap = Record<string, CategoryBudget>;

/** The reserved category id for transfers between own accounts. */
export const TRANSFER_CATEGORY_ID = 'transfer';

/**
 * The reserved category for transfers to/from the household's own
 * savings/investment accounts (group `savings`; its net counts as Saved). One
 * such category exists in the data repo. Note this is a savings-group category,
 * NOT a transfer-group one — it is deliberately NOT excluded like the legacy
 * `transfer` id/group, so its net lands in `savedHalere`.
 */
export const SAVINGS_TRANSFERS_CATEGORY_ID = 'savings-transfers';

/**
 * Groups whose outflow is SPENDING (savings are counted separately). `'expense'`
 * is the current group; `'fixed'` and `'variable'` are legacy aliases kept for
 * backward compatibility — the app used to split spending into those two (always
 * treated identically) before collapsing them into `'expense'`, and old data
 * (plus the data repo, migrated separately) may still carry them.
 */
const EXPENSE_GROUPS = new Set<string>(['expense', 'fixed', 'variable']);

/**
 * True for groups whose outflow counts as spending. The UI uses this for the
 * spending budget list and top-spending — income rows are already counted in the
 * income total, savings rows in the saved total. Accepts a plain string (not just
 * `CategoryGroup`) so the legacy `'fixed'`/`'variable'` values still on disk,
 * which the narrowed `CategoryGroup` union no longer names, are matched too.
 */
export function isExpenseGroup(group: string | undefined): boolean {
  return group !== undefined && EXPENSE_GROUPS.has(group);
}

/** True for the savings group — outflow is money put away, not spent. */
export function isSavingsGroup(group: CategoryGroup | undefined): boolean {
  return group === 'savings';
}

/** `'YYYY-MM'` for an ISO date (or any string beginning with one). */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * The budget for a category in a given month: a per-month override wins over the
 * default; `null` if neither is set.
 */
export function budgetFor(
  budgets: BudgetMap,
  categoryId: string,
  month: string,
): number | null {
  const entry = budgets[categoryId];
  if (!entry) {
    return null;
  }
  const override = entry.overrides?.[month];
  if (override !== undefined) {
    return override;
  }
  return entry.defaultMonthlyHalere ?? null;
}

/** True when a transaction's category is a transfer (by id or by group). The
 *  Month view reuses this to list transfer rows (still excluded from totals). */
export function isTransferCategory(categoryId: string, byId: Map<string, Category>): boolean {
  if (categoryId === TRANSFER_CATEGORY_ID) {
    return true;
  }
  return byId.get(categoryId)?.group === 'transfer';
}

/** One row of the per-category breakdown. */
export interface CategorySummary {
  categoryId: string;
  /** The category's group, or undefined when the id is unknown (e.g. a
   *  transaction referencing a deleted-from-file category). Lets the UI filter
   *  presentation (spending vs saving sections) without the engine dropping
   *  any data. */
  group?: CategoryGroup;
  /** Signed sum of amounts in the category (negative = net outflow). */
  netHalere: number;
  /** Positive net outflow for expense AND savings rows (for savings this is
   *  the amount put away; a withdrawal month can go negative). 0 for
   *  income/transfer/unknown rows. */
  spendHalere: number;
  /** Budget for the month, or null when none is set. */
  budgetHalere: number | null;
  /** Expense rows only: budget set and spend exceeds it (a problem). Savings
   *  rows are never marked over-budget — exceeding a savings target is good. */
  overBudget: boolean;
  /** Savings rows only: budget (target) set and the amount put away reached
   *  it. Absent on non-savings rows. */
  targetMet?: boolean;
}

export interface MonthSummary {
  /** Sum of positive amounts in income-group categories. */
  incomeHalere: number;
  /** Positive: net outflow across fixed+variable categories (refunds net). */
  spendHalere: number;
  /** Net amount put away into savings-group categories this month (negative
   *  when more was withdrawn than deposited). */
  savedHalere: number;
  /** incomeHalere − spendHalere − savedHalere: what's neither spent nor put
   *  away — the month's slack. */
  leftoverHalere: number;
  /** Per-category rows, sorted by outflow descending. */
  byCategory: CategorySummary[];
  /** How many transactions have no category yet. */
  unclassifiedCount: number;
  /** How many transactions are transfers (excluded from totals). */
  transferCount: number;
}

/**
 * Roll up a month's transactions into income/spent/saved/leftover totals and a
 * per-category budget-vs-actual breakdown. `budgets` is the category-id →
 * budget map and `month` is the `'YYYY-MM'` key the overrides are looked up
 * under.
 */
export function summarizeMonth(
  transactions: Transaction[],
  categories: Category[],
  budgets: BudgetMap,
  month: string,
): MonthSummary {
  const byId = new Map<string, Category>(categories.map((c) => [c.id, c]));

  let incomeHalere = 0;
  let unclassifiedCount = 0;
  let transferCount = 0;

  // Signed sum per category id (income + expense + savings groups land here).
  const netByCategory = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.categoryId === null) {
      unclassifiedCount += 1;
      continue;
    }
    if (isTransferCategory(tx.categoryId, byId)) {
      transferCount += 1;
      continue;
    }
    const group = byId.get(tx.categoryId)?.group;
    netByCategory.set(tx.categoryId, (netByCategory.get(tx.categoryId) ?? 0) + tx.amountHalere);
    if (group === 'income' && tx.amountHalere > 0) {
      incomeHalere += tx.amountHalere;
    }
  }

  // Include categories that have activity OR a budget set for this month, so the
  // budget-vs-actual list still shows a budgeted category with no spend yet.
  const ids = new Set<string>(netByCategory.keys());
  for (const id of Object.keys(budgets)) {
    if (budgetFor(budgets, id, month) === null) {
      continue;
    }
    if (id === TRANSFER_CATEGORY_ID || byId.get(id)?.group === 'transfer') {
      continue;
    }
    ids.add(id);
  }

  let spendHalere = 0;
  let savedHalere = 0;
  const byCategory: CategorySummary[] = [];

  for (const id of ids) {
    const group = byId.get(id)?.group;
    const net = netByCategory.get(id) ?? 0;
    const isExpense = isExpenseGroup(group);
    const isSavings = isSavingsGroup(group);
    // Outflow is the negated signed sum; refunds already netted in. `+ 0`
    // normalises the negative zero that `-0` produces for a no-activity row.
    const outflow = isExpense || isSavings ? -net + 0 : 0;
    if (isExpense) {
      spendHalere += outflow;
    } else if (isSavings) {
      savedHalere += outflow;
    }
    const budgetHalere = budgetFor(budgets, id, month);
    const row: CategorySummary = {
      categoryId: id,
      netHalere: net,
      spendHalere: outflow,
      budgetHalere,
      // A savings target is a floor, never a ceiling — only expense rows can
      // be over budget.
      overBudget: isExpense && budgetHalere !== null && outflow > budgetHalere,
    };
    if (isSavings) {
      row.targetMet = budgetHalere !== null && outflow >= budgetHalere;
    }
    if (group !== undefined) {
      row.group = group;
    }
    byCategory.push(row);
  }

  byCategory.sort((a, b) => b.spendHalere - a.spendHalere);

  return {
    incomeHalere,
    spendHalere,
    savedHalere,
    leftoverHalere: incomeHalere - spendHalere - savedHalere,
    byCategory,
    unclassifiedCount,
    transferCount,
  };
}

/**
 * The month's savings rate — the share of income put away net. Feeds scenario
 * planning (Phase 3). Returns `null` when there is no positive income to measure
 * against; otherwise `savedHalere / incomeHalere × 100`, which may be negative in
 * a net-withdrawal month and may exceed 100 (saving more than was earned).
 */
export function savingsRate(summary: MonthSummary): number | null {
  if (summary.incomeHalere <= 0) {
    return null;
  }
  return (summary.savedHalere / summary.incomeHalere) * 100;
}
