// Income allocation for the monthly donut: how one month's income splits into
// Spent / Saved / Left over. Pure — no React. Income is the whole; the three
// pieces sum to it (income − spent − saved = leftover), so they are shares of
// income, not four independent quantities. A pie can only show non-negative
// slices, so months that don't fit that shape report a status instead.

import type { MonthSummary } from './summarize';

export type AllocationStatus = 'ok' | 'no-income' | 'overspent' | 'withdrawn';

export type AllocationKey = 'spent' | 'saved' | 'leftover';

export interface AllocationSlice {
  key: AllocationKey;
  label: string;
  halere: number;
  /** Share of income in percent (0–100). */
  pct: number;
}

export interface IncomeAllocation {
  status: AllocationStatus;
  incomeHalere: number;
  /** The three slices (only when status is 'ok'); each pct is a share of income. */
  slices: AllocationSlice[];
  /** For 'overspent': spending as a percent of income (> 100). */
  overspentPct?: number;
}

const LABELS: Record<AllocationKey, string> = {
  spent: 'Spent',
  saved: 'Saved',
  leftover: 'Left over',
};

/**
 * Derive the donut's slices and edge-case status from a month summary.
 * - `no-income`: income ≤ 0 — nothing to allocate.
 * - `withdrawn`: net savings are negative (money taken out) — not a slice.
 * - `overspent`: spending + saving exceeded income (leftover < 0) — no pie.
 * - `ok`: three non-negative slices as shares of income.
 */
export function incomeAllocation(summary: MonthSummary): IncomeAllocation {
  const income = summary.incomeHalere;

  if (income <= 0) {
    return { status: 'no-income', incomeHalere: income, slices: [] };
  }
  if (summary.savedHalere < 0) {
    return { status: 'withdrawn', incomeHalere: income, slices: [] };
  }
  if (summary.leftoverHalere < 0) {
    return {
      status: 'overspent',
      incomeHalere: income,
      slices: [],
      overspentPct: (summary.spendHalere / income) * 100,
    };
  }

  const pieces: Array<[AllocationKey, number]> = [
    ['spent', summary.spendHalere],
    ['saved', summary.savedHalere],
    ['leftover', summary.leftoverHalere],
  ];
  const slices = pieces.map(([key, halere]) => ({
    key,
    label: LABELS[key],
    halere,
    pct: (halere / income) * 100,
  }));

  return { status: 'ok', incomeHalere: income, slices };
}
