// Cash-flow series: per-month income vs expenses across the calendar year of
// the month being viewed. Pure — no React. Only months that actually have
// transactions produce a point, so the chart starts as dots and grows into
// lines as more months are imported.

import type { Category, Transaction } from '../types/data';
import { summarizeMonth } from './summarize';
import type { BudgetMap } from './summarize';

export interface CashFlowPoint {
  /** `'YYYY-MM'`. */
  month: string;
  incomeHalere: number;
  /** Spending (expense-group categories), matching the app's "Spent" total. */
  expensesHalere: number;
}

/**
 * Per-month income and expenses for January through `viewedMonth` of that
 * month's year. A month with no transactions is skipped entirely (no zero
 * point), so a single imported month shows one dot per line and the lines
 * fill in as more months arrive.
 */
export function cashFlowForYear(
  monthsData: Record<string, Transaction[]>,
  categories: Category[],
  budgets: BudgetMap,
  viewedMonth: string,
): CashFlowPoint[] {
  const year = viewedMonth.slice(0, 4);
  const upTo = Number(viewedMonth.slice(5, 7));
  const points: CashFlowPoint[] = [];

  for (let m = 1; m <= upTo; m++) {
    const mk = `${year}-${String(m).padStart(2, '0')}`;
    const txs = monthsData[mk];
    if (!txs || txs.length === 0) {
      continue;
    }
    const s = summarizeMonth(txs, categories, budgets, mk);
    points.push({ month: mk, incomeHalere: s.incomeHalere, expensesHalere: s.spendHalere });
  }

  return points;
}
