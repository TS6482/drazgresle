import { describe, expect, it } from 'vitest';
import { cashFlowForYear } from './cashflow';
import type { Category, Transaction } from '../types/data';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', group: 'income' },
  { id: 'groceries', name: 'Groceries', group: 'variable' },
];

let seq = 0;
function tx(month: string, day: string, amountHalere: number, categoryId: string): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date: `${month}-${day}`,
    amountHalere,
    counterparty: 'x',
    description: 'x',
    account: '',
    categoryId,
    source: 'manual',
  };
}

describe('cashFlowForYear', () => {
  it('emits one point per month that has data, Jan..viewed, in order', () => {
    const months: Record<string, Transaction[]> = {
      '2026-01': [tx('2026-01', '10', 5_000_000, 'salary'), tx('2026-01', '11', -1_000_000, 'groceries')],
      '2026-03': [tx('2026-03', '05', 6_000_000, 'salary'), tx('2026-03', '06', -2_000_000, 'groceries')],
    };
    const series = cashFlowForYear(months, categories, {}, '2026-04');
    expect(series.map((p) => p.month)).toEqual(['2026-01', '2026-03']);
    expect(series[0]).toEqual({ month: '2026-01', incomeHalere: 5_000_000, expensesHalere: 1_000_000 });
    expect(series[1]).toEqual({ month: '2026-03', incomeHalere: 6_000_000, expensesHalere: 2_000_000 });
  });

  it('skips empty months (they never become zero points)', () => {
    const months: Record<string, Transaction[]> = {
      '2026-02': [tx('2026-02', '10', 4_000_000, 'salary')],
      '2026-03': [],
    };
    const series = cashFlowForYear(months, categories, {}, '2026-06');
    expect(series.map((p) => p.month)).toEqual(['2026-02']);
  });

  it('never looks past the viewed month, and isolates the viewed year', () => {
    const months: Record<string, Transaction[]> = {
      '2025-12': [tx('2025-12', '10', 9_000_000, 'salary')],
      '2026-01': [tx('2026-01', '10', 4_000_000, 'salary')],
      '2026-05': [tx('2026-05', '10', 4_000_000, 'salary')],
    };
    const series = cashFlowForYear(months, categories, {}, '2026-03');
    expect(series.map((p) => p.month)).toEqual(['2026-01']); // no 2025, no May
  });
});
