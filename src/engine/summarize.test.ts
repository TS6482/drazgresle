import { describe, expect, it } from 'vitest';
import {
  budgetFor,
  isExpenseGroup,
  isSavingsGroup,
  isTransferCategory,
  monthKey,
  summarizeMonth,
} from './summarize';
import type { BudgetMap } from './summarize';
import type { Category, Transaction } from '../types/data';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', group: 'income' },
  { id: 'groceries', name: 'Groceries', group: 'expense' },
  { id: 'rent', name: 'Rent', group: 'expense' },
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

  it('applies an override-only budget to its month, and null to every other', () => {
    const overrideOnly: BudgetMap = { groceries: { overrides: { '2026-07': 500_000 } } };
    expect(budgetFor(overrideOnly, 'groceries', '2026-07')).toBe(500_000);
    // No default set → months without an override have NO budget, not 0.
    expect(budgetFor(overrideOnly, 'groceries', '2026-08')).toBeNull();
  });
});

describe('isExpenseGroup / isSavingsGroup', () => {
  it('the expense group counts as spending, plus its legacy fixed/variable aliases', () => {
    expect(isExpenseGroup('expense')).toBe(true);
    // Legacy groups from before fixed+variable were merged still count.
    expect(isExpenseGroup('fixed')).toBe(true);
    expect(isExpenseGroup('variable')).toBe(true);
    expect(isExpenseGroup('savings')).toBe(false);
    expect(isExpenseGroup('income')).toBe(false);
    expect(isExpenseGroup('transfer')).toBe(false);
    expect(isExpenseGroup(undefined)).toBe(false);
  });

  it('the savings group stands alone', () => {
    expect(isSavingsGroup('savings')).toBe(true);
    expect(isSavingsGroup('expense')).toBe(false);
    expect(isSavingsGroup('income')).toBe(false);
    expect(isSavingsGroup(undefined)).toBe(false);
  });
});

describe('isTransferCategory', () => {
  const byId = new Map<string, Category>(categories.map((c) => [c.id, c]));

  it('matches the reserved transfer id even with no category record', () => {
    expect(isTransferCategory('transfer', new Map())).toBe(true);
  });

  it('matches any category whose group is transfer, regardless of id', () => {
    const named = new Map<string, Category>([
      ['move-money', { id: 'move-money', name: 'Internal move', group: 'transfer' }],
    ]);
    expect(isTransferCategory('move-money', named)).toBe(true);
  });

  it('is false for income, expense, savings, and unknown categories', () => {
    expect(isTransferCategory('salary', byId)).toBe(false);
    expect(isTransferCategory('groceries', byId)).toBe(false);
    expect(isTransferCategory('save', byId)).toBe(false);
    expect(isTransferCategory('ghost', byId)).toBe(false);
  });
});

describe('summarizeMonth', () => {
  const noBudgets: BudgetMap = {};

  it('splits income, spending, and savings, and computes the leftover', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: 5_000_000, categoryId: 'salary' }),
        tx({ amountHalere: -200_000, categoryId: 'groceries' }),
        tx({ amountHalere: -1_500_000, categoryId: 'rent' }),
        tx({ amountHalere: -1_000_000, categoryId: 'save' }),
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    expect(s.incomeHalere).toBe(5_000_000);
    // Savings are NOT spending: only groceries + rent count here.
    expect(s.spendHalere).toBe(1_700_000);
    expect(s.savedHalere).toBe(1_000_000);
    expect(s.leftoverHalere).toBe(2_300_000);
  });

  it('nets savings deposits against withdrawals; a withdrawal month goes negative', () => {
    const s = summarizeMonth(
      [
        tx({ amountHalere: -500_000, categoryId: 'save' }),
        tx({ amountHalere: 200_000, categoryId: 'save' }), // withdrawal back
      ],
      categories,
      noBudgets,
      '2026-07',
    );
    expect(s.savedHalere).toBe(300_000);
    expect(s.spendHalere).toBe(0);

    const withdrew = summarizeMonth(
      [tx({ amountHalere: 400_000, categoryId: 'save' })],
      categories,
      noBudgets,
      '2026-07',
    );
    expect(withdrew.savedHalere).toBe(-400_000);
    expect(withdrew.leftoverHalere).toBe(400_000); // freed money is leftover
  });

  it('marks a savings target met (floor semantics), never over-budget', () => {
    const budgets: BudgetMap = { save: { defaultMonthlyHalere: 500_000 } };
    const met = summarizeMonth(
      [tx({ amountHalere: -600_000, categoryId: 'save' })],
      categories,
      budgets,
      '2026-07',
    );
    const metRow = met.byCategory.find((c) => c.categoryId === 'save');
    expect(metRow?.targetMet).toBe(true);
    // Exceeding a savings target is good — never flagged as over-budget.
    expect(metRow?.overBudget).toBe(false);

    const notMet = summarizeMonth(
      [tx({ amountHalere: -100_000, categoryId: 'save' })],
      categories,
      budgets,
      '2026-07',
    );
    const notMetRow = notMet.byCategory.find((c) => c.categoryId === 'save');
    expect(notMetRow?.targetMet).toBe(false);
    expect(notMetRow?.overBudget).toBe(false);
    // Expense rows carry no targetMet at all.
    const expense = summarizeMonth(
      [tx({ amountHalere: -100_000, categoryId: 'groceries' })],
      categories,
      { groceries: { defaultMonthlyHalere: 50_000 } },
      '2026-07',
    );
    const expenseRow = expense.byCategory.find((c) => c.categoryId === 'groceries');
    expect(expenseRow?.targetMet).toBeUndefined();
    expect(expenseRow?.overBudget).toBe(true); // ceiling semantics unchanged
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

  it('an override-only budget binds only to its month; other months get no ceiling', () => {
    // Regression: a budget with a per-month override but a blank default used to
    // persist defaultMonthlyHalere: 0, so every other month showed a 0 Kč
    // ceiling and flagged any spend as over-budget.
    const budgets: BudgetMap = { groceries: { overrides: { '2026-07': 40_000 } } };

    const overrideMonth = summarizeMonth(
      [tx({ amountHalere: -60_000, categoryId: 'groceries' })],
      categories,
      budgets,
      '2026-07',
    );
    const inMonth = overrideMonth.byCategory.find((c) => c.categoryId === 'groceries');
    expect(inMonth?.budgetHalere).toBe(40_000); // the override applies
    expect(inMonth?.overBudget).toBe(true); // 60k spend > 40k override

    const otherMonth = summarizeMonth(
      [tx({ amountHalere: -60_000, categoryId: 'groceries' })],
      categories,
      budgets,
      '2026-08',
    );
    const elsewhere = otherMonth.byCategory.find((c) => c.categoryId === 'groceries');
    expect(elsewhere?.budgetHalere).toBeNull(); // no budget — not 0
    expect(elsewhere?.overBudget).toBe(false); // and therefore never over-budget
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
    expect(s.byCategory.find((c) => c.categoryId === 'groceries')?.group).toBe('expense');
  });

  it('counts legacy fixed/variable categories as spending (data-repo not yet migrated)', () => {
    // Old categories.json still stores fixed/variable; those are the narrowed
    // union's legacy values and must keep landing in the Spent total, not
    // leftover. `group` goes through a string cast because CategoryGroup no
    // longer names them.
    const g = (group: string): Category['group'] => group as Category['group'];
    const legacy: Category[] = [
      { id: 'salary', name: 'Salary', group: 'income' },
      { id: 'rent', name: 'Rent', group: g('fixed') },
      { id: 'groceries', name: 'Groceries', group: g('variable') },
    ];
    const s = summarizeMonth(
      [
        tx({ amountHalere: 5_000_000, categoryId: 'salary' }),
        tx({ amountHalere: -1_500_000, categoryId: 'rent' }),
        tx({ amountHalere: -300_000, categoryId: 'groceries' }),
      ],
      legacy,
      noBudgets,
      '2026-07',
    );
    expect(s.spendHalere).toBe(1_800_000);
    expect(s.savedHalere).toBe(0);
    expect(s.leftoverHalere).toBe(3_200_000);
    const rent = s.byCategory.find((c) => c.categoryId === 'rent');
    expect(rent?.spendHalere).toBe(1_500_000);
    expect(rent?.overBudget).toBe(false);
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
      savedHalere: 0,
      leftoverHalere: 0,
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
