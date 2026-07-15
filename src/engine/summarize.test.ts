import { describe, expect, it } from 'vitest';
import {
  budgetFor,
  isExpenseGroup,
  monthKey,
  summarizeMonth,
  totalBudgetForMonth,
} from './summarize';
import type { BudgetMap } from './summarize';
import type { Category, Transaction } from '../types/data';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', group: 'income' },
  { id: 'groceries', name: 'Groceries', group: 'variable' },
  { id: 'rent', name: 'Rent', group: 'fixed' },
  { id: 'save', name: 'Savings', group: 'savings' },
  { id: 'transfer', name: 'Transfer', group: 'transfer' },
];

let seq = 0;
function tx(partial: Partial<Transaction> & { amountHalere: number }): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date: '2026-07-10',
    counterparty: '',
    description: '',
    account: '',
    categoryId: null,
    source: 'manual',
    ...partial,
  };
}

describe('monthKey', () => {
  it('extracts YYYY-MM from an ISO date', () => {
    expect(monthKey('2026-07-14')).toBe('2026-07');
    expect(monthKey('2026-12-01')).toBe('2026-12');
  });
});

describe('budgetFor', () => {
  const budgets: BudgetMap = {
    groceries: { defaultMonthlyHalere: 800_000, overrides: { '2026-07': 1_000_000 } },
    rent: { defaultMonthlyHalere: 1_500_000 },
  };

  it('returns the default when no override exists', () => {
    expect(budgetFor(budgets, 'rent', '2026-07')).toBe(1_500_000);
    expect(budgetFor(budgets, 'groceries', '2026-08')).toBe(800_000);
  });

  it('lets a per-month override beat the default', () => {
    expect(budgetFor(budgets, 'groceries', '2026-07')).toBe(1_000_000);
  });

  it('returns null for a category with no budget', () => {
    expect(budgetFor(budgets, 'save', '2026-07')).toBeNull();
  });
});

describe('totalBudgetForMonth', () => {
  it('sums each category budget, applying overrides', () => {
    const budgets: BudgetMap = {
      groceries: { defaultMonthlyHalere: 800_000, overrides: { '2026-07': 1_000_000 } },
      rent: { defaultMonthlyHalere: 1_500_000 },
    };
    expect(totalBudgetForMonth(budgets, '2026-07')).toBe(2_500_000);
    expect(totalBudgetForMonth(budgets, '2026-08')).toBe(2_300_000);
  });

  it('returns null when no budgets are set', () => {
    expect(totalBudgetForMonth({}, '2026-07')).toBeNull();
  });
});

describe('isExpenseGroup', () => {
  it('is true only for the budgeted expense groups', () => {
    expect(isExpenseGroup('fixed')).toBe(true);
    expect(isExpenseGroup('variable')).toBe(true);
    expect(isExpenseGroup('savings')).toBe(true);
    expect(isExpenseGroup('income')).toBe(false);
    expect(isExpenseGroup('transfer')).toBe(false);
    expect(isExpenseGroup(undefined)).toBe(false);
  });
});

describe('summarizeMonth', () => {
  const noBudgets: BudgetMap = {};

  it('splits income from spend and computes net', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: 5_000_000, categoryId: 'salary' }),
        tx({ amountHalere: -200_000, categoryId: 'groceries' }),
        tx({ amountHalere: -1_500_000, categoryId: 'rent' }),
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    expect(s.incomeHalere).toBe(5_000_000);
    expect(s.spendHalere).toBe(1_700_000);
    expect(s.netHalere).toBe(3_300_000);
  });

  it('nets a refund against its category', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: -100_000, categoryId: 'groceries' }),
        tx({ amountHalere: 30_000, categoryId: 'groceries' }), // refund
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    const groceries = s.byCategory.find((c) => c.categoryId === 'groceries');
    expect(groceries?.netHalere).toBe(-70_000);
    expect(groceries?.spendHalere).toBe(70_000);
    expect(s.spendHalere).toBe(70_000);
  });

  it('excludes transfers from totals and counts them', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: -500_000, categoryId: 'transfer' }),
        tx({ amountHalere: 500_000, categoryId: 'transfer' }),
        tx({ amountHalere: -100_000, categoryId: 'groceries' }),
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    expect(s.transferCount).toBe(2);
    expect(s.spendHalere).toBe(100_000);
    expect(s.incomeHalere).toBe(0);
    expect(s.byCategory.some((c) => c.categoryId === 'transfer')).toBe(false);
  });

  it('treats a category with group transfer as a transfer even if id differs', () => {
    const withNamedTransfer: Category[] = [
      ...categories,
      { id: 'move-money', name: 'Internal move', group: 'transfer' },
    ];
    const s = summarizeMonth(
      [tx({ amountHalere: -400_000, categoryId: 'move-money' })],
      withNamedTransfer,
      noBudgets,
      '2026-07',
    );
    expect(s.transferCount).toBe(1);
    expect(s.spendHalere).toBe(0);
  });

  it('counts unclassified transactions and excludes them from totals', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: -100_000, categoryId: null }),
        tx({ amountHalere: -50_000, categoryId: 'groceries' }),
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    expect(s.unclassifiedCount).toBe(1);
    expect(s.spendHalere).toBe(50_000);
  });

  it('flags over-budget and honours override-beats-default', () => {
    const budgets: BudgetMap = {
      groceries: { defaultMonthlyHalere: 100_000, overrides: { '2026-07': 40_000 } },
    };
    const s = summarizeMonth(
      [tx({ amountHalere: -60_000, categoryId: 'groceries' })],
      categories,
      budgets,
      '2026-07',
    );
    const groceries = s.byCategory.find((c) => c.categoryId === 'groceries');
    expect(groceries?.budgetHalere).toBe(40_000); // override wins
    expect(groceries?.overBudget).toBe(true); // 60k spend > 40k budget

    const later = summarizeMonth(
      [tx({ amountHalere: -60_000, categoryId: 'groceries' })],
      categories,
      budgets,
      '2026-08',
    );
    const g2 = later.byCategory.find((c) => c.categoryId === 'groceries');
    expect(g2?.budgetHalere).toBe(100_000); // default in a month with no override
    expect(g2?.overBudget).toBe(false);
  });

  it('includes a budgeted category with no spend and sorts by spend desc', () => {
    const budgets: BudgetMap = { save: { defaultMonthlyHalere: 500_000 } };
    const s = summarizeMonth(
      [
        tx({ amountHalere: -100_000, categoryId: 'groceries' }),
        tx({ amountHalere: -300_000, categoryId: 'rent' }),
      ],
      categories,
      budgets,
      '2026-07',
    );
    expect(s.byCategory.map((c) => c.categoryId)).toEqual(['rent', 'groceries', 'save']);
    const save = s.byCategory.find((c) => c.categoryId === 'save');
    expect(save?.spendHalere).toBe(0);
    expect(save?.budgetHalere).toBe(500_000);
  });

  it('exposes each row’s category group, keeping income rows in byCategory', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: 5_000_000, categoryId: 'salary' }),
        tx({ amountHalere: -200_000, categoryId: 'groceries' }),
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    // The engine stays complete: the income row is present (with its group),
    // so filtering it out of budget-vs-actual is purely presentation.
    const salary = s.byCategory.find((c) => c.categoryId === 'salary');
    expect(salary).toBeDefined();
    expect(salary?.group).toBe('income');
    expect(salary?.netHalere).toBe(5_000_000);
    expect(s.byCategory.find((c) => c.categoryId === 'groceries')?.group).toBe('variable');
  });

  it('leaves group undefined for a transaction with an unknown category id', () => {
    const s = summarizeMonth(
      [tx({ amountHalere: -100_000, categoryId: 'ghost' })],
      categories,
      noBudgets,
      '2026-07',
    );
    const ghost = s.byCategory.find((c) => c.categoryId === 'ghost');
    expect(ghost).toBeDefined();
    expect(ghost?.group).toBeUndefined();
    // Unknown ids are not expense groups, so they carry no spend either.
    expect(ghost?.spendHalere).toBe(0);
    expect(ghost?.netHalere).toBe(-100_000);
  });

  it('handles an empty month', () => {
    const s = summarizeMonth([], categories, noBudgets, '2026-07');
    expect(s).toEqual({
      incomeHalere: 0,
      spendHalere: 0,
      netHalere: 0,
      byCategory: [],
      unclassifiedCount: 0,
      transferCount: 0,
    });
  });

  it('treats categoryId "transfer" as a transfer even without a category record', () => {
    const s = summarizeMonth(
      [tx({ amountHalere: -400_000, categoryId: 'transfer' })],
      [], // no categories defined at all
      noBudgets,
      '2026-07',
    );
    expect(s.transferCount).toBe(1);
    expect(s.spendHalere).toBe(0);
  });
});
