// Pay-cycle windowing for the Month view (see docs/ARCHITECTURE.md). A pay cycle
// runs from a configurable start day of one month to the day before the same day
// of the next month, and is LABELLED by its start month. Czech salaries land
// ~10th, so a household can view "July" spending as Jul 10 – Aug 9 instead of the
// calendar month. Pure — no React, no I/O. All dates are ISO `YYYY-MM-DD`, so
// lexicographic string comparison equals chronological order, and a cycle spans
// at most two calendar-month transaction files (the label month and the next).

import type { Transaction } from '../types/data';
import { shiftMonth } from '../utils/dates';

/** Two-digit zero-padded month/day component. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** The ISO date one calendar day before `iso`. */
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * The half-open date range of the pay cycle labelled by `labelMonth`
 * (`'YYYY-MM'`), starting on `startDay`. `start` is inclusive; `endExclusive` is
 * the same day-of-month one month later (exclusive), handling year rollover.
 * e.g. ('2026-07', 10) → { start: '2026-07-10', endExclusive: '2026-08-10' }.
 */
export function payCycleRange(
  labelMonth: string,
  startDay: number,
): { start: string; endExclusive: string } {
  return {
    start: `${labelMonth}-${pad2(startDay)}`,
    endExclusive: `${shiftMonth(labelMonth, 1)}-${pad2(startDay)}`,
  };
}

/**
 * The transactions falling in the pay cycle labelled by `labelMonth`: the label
 * month's rows on/after `startDay`, plus the next calendar month's rows before
 * `startDay`. Either month array may be absent (treated as empty). Order is not
 * preserved — the Month view re-sorts. `startDay === 1` degenerates to exactly
 * the calendar label month.
 */
export function payCycleTransactions(
  months: Record<string, Transaction[]>,
  labelMonth: string,
  startDay: number,
): Transaction[] {
  const { start, endExclusive } = payCycleRange(labelMonth, startDay);
  const pool = [...(months[labelMonth] ?? []), ...(months[shiftMonth(labelMonth, 1)] ?? [])];
  return pool.filter((t) => start <= t.date && t.date < endExclusive);
}

/**
 * Human display bounds for a pay cycle: `startDate` (inclusive) and `endDate` —
 * the day BEFORE `endExclusive`, i.e. the last day actually in the cycle — for a
 * caption like "10 Jul – 9 Aug".
 */
export function payCycleLabelRange(
  labelMonth: string,
  startDay: number,
): { startDate: string; endDate: string } {
  const { start, endExclusive } = payCycleRange(labelMonth, startDay);
  return { startDate: start, endDate: dayBefore(endExclusive) };
}
