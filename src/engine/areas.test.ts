import { describe, expect, it } from 'vitest';
import { SPENDING_AREAS, areaColor, areaIcon, areaName, areaOf, spendingByArea } from './areas';
import type { CategorySummary } from './summarize';
import type { Category } from '../types/data';

/** `group` is typed `string | undefined` so tests can pass legacy `'fixed'`/
 *  `'variable'` values the narrowed `CategoryGroup` union no longer names. */
function cat(partial: { id: string; group?: string; area?: string }): Category {
  return {
    id: partial.id,
    name: partial.id,
    group: (partial.group ?? 'expense') as Category['group'],
    area: partial.area,
  };
}

function row(categoryId: string, spendHalere: number, group: string | undefined = 'expense'): CategorySummary {
  return {
    categoryId,
    group: group as CategorySummary['group'],
    netHalere: -spendHalere,
    spendHalere,
    budgetHalere: null,
    overBudget: false,
  };
}

/** Build the id → Category map spendingByArea expects. */
function map(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

describe('areaName', () => {
  it('names a known area and falls back to Others for anything else', () => {
    expect(areaName('essential')).toBe('Essential Living');
    expect(areaName('food')).toBe('Food');
    expect(areaName('others')).toBe('Others');
    expect(areaName('nope')).toBe('Others');
    expect(areaName('')).toBe('Others');
  });
});

describe('areaIcon / areaColor', () => {
  it('returns the area default tile for a known id', () => {
    expect(areaIcon('essential')).toBe('house');
    expect(areaColor('essential')).toBe('blue');
    expect(areaIcon('food')).toBe('fork-knife');
    expect(areaColor('food')).toBe('orange');
  });

  it('falls back to tag/gray for an unknown id', () => {
    expect(areaIcon('nope')).toBe('tag');
    expect(areaColor('nope')).toBe('gray');
  });
});

describe('areaOf', () => {
  it('returns the stored area when it is a known id', () => {
    expect(areaOf(cat({ id: 'g', area: 'food' }))).toBe('food');
    expect(areaOf(cat({ id: 'r', area: 'kids' }))).toBe('kids');
  });

  it('falls back to others when unset or unknown', () => {
    expect(areaOf(cat({ id: 'g' }))).toBe('others');
    expect(areaOf(cat({ id: 'g', area: 'nonsense' }))).toBe('others');
  });
});

describe('spendingByArea', () => {
  it('maps each expense category’s spend into its assigned area, summing within an area', () => {
    const categories = [
      cat({ id: 'groceries', area: 'food' }),
      cat({ id: 'restaurants', area: 'food' }),
      cat({ id: 'rent', area: 'essential' }),
    ];
    const result = spendingByArea(
      [row('groceries', 200_000), row('restaurants', 50_000), row('rent', 1_500_000)],
      map(categories),
    );
    const byArea = Object.fromEntries(result.map((a) => [a.areaId, a.spendHalere]));
    expect(byArea.food).toBe(250_000);
    expect(byArea.essential).toBe(1_500_000);
    expect(byArea.entertainment).toBe(0);
  });

  it('sends unassigned and unknown-area categories to others', () => {
    const categories = [cat({ id: 'misc' }), cat({ id: 'weird', area: 'ghost-area' })];
    const result = spendingByArea([row('misc', 100_000), row('weird', 40_000)], map(categories));
    expect(result.find((a) => a.areaId === 'others')?.spendHalere).toBe(140_000);
  });

  it('sends a row whose category is not in the map to others', () => {
    const result = spendingByArea([row('ghost', 90_000)], map([]));
    expect(result.find((a) => a.areaId === 'others')?.spendHalere).toBe(90_000);
  });

  it('counts EXPENSE rows only — income, savings, transfer, and unknown groups are excluded', () => {
    const categories = [
      cat({ id: 'salary', group: 'income', area: 'food' }),
      cat({ id: 'invest', group: 'savings', area: 'food' }),
      cat({ id: 'move', group: 'transfer', area: 'food' }),
      cat({ id: 'groceries', group: 'expense', area: 'food' }),
    ];
    const result = spendingByArea(
      [
        row('salary', 5_000_000, 'income'),
        row('invest', 1_000_000, 'savings'),
        row('move', 400_000, 'transfer'),
        row('groceries', 200_000, 'expense'),
        // Unknown group (field omitted, e.g. a deleted-from-file category).
        { categoryId: 'mystery', netHalere: -300_000, spendHalere: 300_000, budgetHalere: null, overBudget: false },
      ],
      map(categories),
    );
    expect(result.find((a) => a.areaId === 'food')?.spendHalere).toBe(200_000);
    expect(result.reduce((s, a) => s + a.spendHalere, 0)).toBe(200_000);
  });

  it('treats legacy fixed/variable groups as expense', () => {
    const categories = [
      cat({ id: 'rent', group: 'fixed', area: 'essential' }),
      cat({ id: 'fun', group: 'variable', area: 'entertainment' }),
    ];
    const result = spendingByArea(
      [row('rent', 1_500_000, 'fixed'), row('fun', 300_000, 'variable')],
      map(categories),
    );
    const byArea = Object.fromEntries(result.map((a) => [a.areaId, a.spendHalere]));
    expect(byArea.essential).toBe(1_500_000);
    expect(byArea.entertainment).toBe(300_000);
  });

  it('returns one entry per area in SPENDING_AREAS order, zeros included', () => {
    const result = spendingByArea([], new Map());
    expect(result.map((a) => a.areaId)).toEqual(SPENDING_AREAS.map((a) => a.id));
    expect(result.map((a) => a.name)).toEqual(SPENDING_AREAS.map((a) => a.name));
    expect(result.every((a) => a.spendHalere === 0)).toBe(true);
  });
});
