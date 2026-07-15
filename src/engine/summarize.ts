// Monthly rollups: income vs spend, per-category net + budget-vs-actual. Pure —
// no React, no I/O. All amounts are signed integer halere (negative = outflow).
//
// Confirmed rules (docs/ROADMAP.md decision log, 2026-07-15):
// - Transfers between the household's own accounts (the reserved `'transfer'`
//   category, or any category with group `'transfer'`) are excluded from every
//   total and from budgets — they are money moving, not earned or spent.
// - Refunds/reimbursements net against their own category: a category's figure
//   is the *sum of signed amounts* in it, so a refund cancels part of the spend.
// - Unclassified transactions (categoryId null) are excluded from income/spend
//   and surfaced separately via `unclassifiedCount`.

import type { Category, CategoryBudget, CategoryGroup, Transaction } from '../types/data';

/** Map of category id → its budget (the `budgets` field of budgets.json). */
export type BudgetMap = Record<string, CategoryBudget>;

/** The reserved category id for transfers between own accounts. */
export const TRANSFER_CATEGORY_ID = 'transfer';

/** Expense groups whose spending counts toward budgets and the spend total. */
const EXPENSE_GROUPS = new Set(['fixed', 'variable', 'savings']);

/**
 * True for groups whose spending is budgeted (fixed/variable/savings). The UI
 * uses this to keep income rows out of budget-vs-actual and top-spending lists
 * — they are already counted in the income total.
 */
export function isExpenseGroup(group: CategoryGroup | undefined): boolean {
  return group !== undefined && EXPENSE_GROUPS.has(group);
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

/**
 * Sum of every category's budget for a month, or `null` when no category has a
 * budget set for it (drives the home screen's "no budgets yet" state).
 */
export function totalBudgetForMonth(budgets: BudgetMap, month: string): number | null {
  let total = 0;
  let any = false;
  for (const id of Object.keys(budgets)) {
    const b = budgetFor(budgets, id, month);
    if (b !== null) {
      total += b;
      any = true;
    }
  }
  return any ? total : null;
}

/** True when a transaction's category is a transfer (by id or by group). */
function isTransferCategory(categoryId: string, byId: Map<string, Category>): boolean {
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
   *  presentation (say, budget-vs-actual shows expense groups only) without
   *  the engine dropping any data. */
  group?: CategoryGroup;
  /** Signed sum of amounts in the category (negative = net outflow). */
  netHalere: number;
  /** Positive spend for expense categories; 0 for income/transfer categories. */
  spendHalere: number;
  /** Budget for the month, or null when none is set. */
  budgetHalere: number | null;
  /** True when a budget is set and spend exceeds it. */
  overBudget: boolean;
}

export interface MonthSummary {
  /** Sum of positive amounts in income-group categories. */
  incomeHalere: number;
  /** Positive: the net outflow across expense-group categories (refunds net). */
  spendHalere: number;
  /** incomeHalere − spendHalere. */
  netHalere: number;
  /** Per-category rows, sorted by spend descending. */
  byCategory: CategorySummary[];
  /** How many transactions have no category yet. */
  unclassifiedCount: number;
  /** How many transactions are transfers (excluded from totals). */
  transferCount: number;
}

/**
 * Roll up a month's transactions into income/spend totals and a per-category
 * budget-vs-actual breakdown. `budgets` is the category-id → budget map and
 * `month` is the `'YYYY-MM'` key the overrides are looked up under.
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

  // Signed sum per category id (only income + expense groups land here).
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
  const byCategory: CategorySummary[] = [];

  for (const id of ids) {
    const group = byId.get(id)?.group;
    const net = netByCategory.get(id) ?? 0;
    const isExpense = group !== undefined && EXPENSE_GROUPS.has(group);
    // Spend is the net outflow (negated signed sum); refunds already netted in.
    // `+ 0` normalises the negative zero that `-0` produces for a no-spend row.
    const spend = isExpense ? -net + 0 : 0;
    if (isExpense) {
      spendHalere += spend;
    }
    const budgetHalere = budgetFor(budgets, id, month);
    const row: CategorySummary = {
      categoryId: id,
      netHalere: net,
      spendHalere: spend,
      budgetHalere,
      overBudget: budgetHalere !== null && spend > budgetHalere,
    };
    if (group !== undefined) {
      row.group = group;
    }
    byCategory.push(row);
  }

  byCategory.sort((a, b) => b.spendHalere - a.spendHalere);

  return {
    incomeHalere,
    spendHalere,
    netHalere: incomeHalere - spendHalere,
    byCategory,
    unclassifiedCount,
    transferCount,
  };
}
