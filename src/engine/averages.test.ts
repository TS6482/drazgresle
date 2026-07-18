import { describe, expect, it } from 'vitest';
import { monthlyAverages } from './averages';
import { SPENDING_AREAS } from './areas';
import type { BudgetMap } from './summarize';
import type { Category, Transaction } from '../types/data';

// All fixtures below are obviously invented — no real account numbers, names, or
// merchants (see CLAUDE.md: never quote statement-derived strings).

const CATEGORIES: Category[] = [
  { id: 'wages', name: 'Wages', group: 'income' },
  { id: 'rent', name: 'Rent', group: 'expense', area: 'essential' },
  { id: 'shop', name: 'Shop', group: 'expense', area: 'food' },
  { id: 'movies', name: 'Movies', group: 'expense', area: 'entertainment' },
];

const NO_BUDGETS: BudgetMap = {};

let seq = 0;
/** Build an invented transaction; only the fields the engine reads are set. */
function tx(date: string, amountHalere: number, categoryId: string | null): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date,
    amountHalere,
    counterparty: 'Someone',
    description: 'Made-up row',
    account: '',
    categoryId,
    source: 'manual',
  };
}

describe('monthlyAverages', () => {
  it('averages spend and income over the months with data (divides by 3)', () => {
    const months: Record<string, Transaction[]> = {
      '2026-01': [tx('2026-01-05', 30_000, 'wages'), tx('2026-01-06', -3_000, 'shop')],
      '2026-02': [tx('2026-02-05', 60_000, 'wages'), tx('2026-02-06', -9_000, 'shop')],
      '2026-03': [tx('2026-03-05', 90_000, 'wages'), tx('2026-03-06', -6_000, 'shop')],
    };
    const result = monthlyAverages(months, CATEGORIES, NO_BUDGETS, [
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(result.monthsUsed).toBe(3);
    // (30 000 + 60 000 + 90 000) / 3
    expect(result.avgIncomeHalere).toBe(60_000);
    // Food spend (3 000 + 9 000 + 6 000) / 3
    expect(result.byArea.find((a) => a.areaId === 'food')?.avgHalere).toBe(6_000);
  });

  it('skips months with no data — the divisor excludes them', () => {
    const months: Record<string, Transaction[]> = {
      '2026-01': [tx('2026-01-05', 40_000, 'wages'), tx('2026-01-06', -2_000, 'shop')],
      '2026-02': [], // present but empty — must not count
      '2026-03': [tx('2026-03-05', 20_000, 'wages'), tx('2026-03-06', -4_000, 'shop')],
      // '2026-04' entirely absent from the map — also must not count
    };
    const result = monthlyAverages(months, CATEGORIES, NO_BUDGETS, [
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    expect(result.monthsUsed).toBe(2);
    // Divided by 2 (the months with data), not 4
    expect(result.avgIncomeHalere).toBe(30_000);
    expect(result.byArea.find((a) => a.areaId === 'food')?.avgHalere).toBe(3_000);
  });

  it('returns all zeros and monthsUsed 0 when no month has data', () => {
    const result = monthlyAverages({ '2026-01': [] }, CATEGORIES, NO_BUDGETS, [
      '2026-01',
      '2026-02',
    ]);
    expect(result.monthsUsed).toBe(0);
    expect(result.avgIncomeHalere).toBe(0);
    expect(result.byArea.every((a) => a.avgHalere === 0)).toBe(true);
  });

  it('attributes each area’s spend to the right area', () => {
    const months: Record<string, Transaction[]> = {
      '2026-01': [
        tx('2026-01-02', -10_000, 'rent'),
        tx('2026-01-03', -4_000, 'shop'),
        tx('2026-01-04', -2_000, 'movies'),
      ],
    };
    const result = monthlyAverages(months, CATEGORIES, NO_BUDGETS, ['2026-01']);
    const byArea = Object.fromEntries(result.byArea.map((a) => [a.areaId, a.avgHalere]));
    expect(byArea.essential).toBe(10_000);
    expect(byArea.food).toBe(4_000);
    expect(byArea.entertainment).toBe(2_000);
    expect(byArea.kids).toBe(0);
    expect(byArea.others).toBe(0);
  });

  it('averages income across months with data', () => {
    const months: Record<string, Transaction[]> = {
      '2026-01': [tx('2026-01-05', 50_000, 'wages')],
      '2026-02': [tx('2026-02-05', 70_000, 'wages')],
    };
    const result = monthlyAverages(months, CATEGORIES, NO_BUDGETS, ['2026-01', '2026-02']);
    expect(result.avgIncomeHalere).toBe(60_000);
  });

  it('returns all five areas in SPENDING_AREAS order', () => {
    const result = monthlyAverages({}, CATEGORIES, NO_BUDGETS, ['2026-01']);
    expect(result.byArea.map((a) => a.areaId)).toEqual(SPENDING_AREAS.map((a) => a.id));
    expect(result.byArea.map((a) => a.name)).toEqual(SPENDING_AREAS.map((a) => a.name));
  });
});
