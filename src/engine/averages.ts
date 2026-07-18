// Trailing-window monthly averages for the Home screen. Pure — no React, no I/O.
// Reuses the month rollup (summarizeMonth) and area attribution (spendingByArea)
// so the "typical month" figures always agree with the Month view; this module
// adds only the averaging over a set of month keys. All amounts are integer
// halere (each average is rounded to the nearest halere to keep the invariant).

import type { Category, Transaction } from '../types/data';
import { summarizeMonth, type BudgetMap } from './summarize';
import { SPENDING_AREAS, spendingByArea } from './areas';

/** Average monthly income + per-area spend across the months that had data. */
export interface HomeAverages {
  /** How many of `monthKeys` had at least one transaction (the divisor). */
  monthsUsed: number;
  /** Average income per month with data, in halere (0 when none). */
  avgIncomeHalere: number;
  /** All five spending areas in `SPENDING_AREAS` order (0 when absent). */
  byArea: { areaId: string; name: string; avgHalere: number }[];
}

/**
 * Average income and per-area spend over `monthKeys`. A month counts only when
 * it has a non-empty transaction array; each total is divided by that count
 * (`monthsUsed`), not by `monthKeys.length`, so empty months never dilute the
 * average. When no month has data, `monthsUsed` is 0 and every average is 0.
 */
export function monthlyAverages(
  months: Record<string, Transaction[]>,
  categories: Category[],
  budgets: BudgetMap,
  monthKeys: string[],
): HomeAverages {
  const byId = new Map<string, Category>(categories.map((c) => [c.id, c]));

  const areaTotals = new Map<string, number>();
  for (const area of SPENDING_AREAS) {
    areaTotals.set(area.id, 0);
  }

  let incomeTotal = 0;
  let monthsUsed = 0;

  for (const key of monthKeys) {
    const txs = months[key];
    if (!txs || txs.length === 0) {
      continue;
    }
    monthsUsed += 1;
    const summary = summarizeMonth(txs, categories, budgets, key);
    incomeTotal += summary.incomeHalere;
    for (const area of spendingByArea(summary.byCategory, byId)) {
      areaTotals.set(area.areaId, (areaTotals.get(area.areaId) ?? 0) + area.spendHalere);
    }
  }

  const byArea = SPENDING_AREAS.map((area) => ({
    areaId: area.id,
    name: area.name,
    avgHalere: monthsUsed === 0 ? 0 : Math.round((areaTotals.get(area.id) ?? 0) / monthsUsed),
  }));

  return {
    monthsUsed,
    avgIncomeHalere: monthsUsed === 0 ? 0 : Math.round(incomeTotal / monthsUsed),
    byArea,
  };
}
