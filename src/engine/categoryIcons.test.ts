import { describe, expect, it } from 'vitest';
import { resolveCategoryIcon } from './categoryIcons';
import type { Category } from '../types/data';

function cat(partial: Partial<Category> & { id: string }): Category {
  return { name: partial.id, group: 'expense', ...partial };
}

describe('resolveCategoryIcon', () => {
  it('keeps the stored glyph but takes an expense colour from the spending area', () => {
    // The stored colour is ignored for expense categories now — the area drives it.
    expect(
      resolveCategoryIcon(cat({ id: 'groceries', icon: 'star', color: 'pink', area: 'food' })),
    ).toEqual({ iconId: 'star', colorId: 'area-food' });
  });

  it('derives an expense colour from its area (glyph still defaulted by id)', () => {
    expect(resolveCategoryIcon(cat({ id: 'groceries', area: 'food' }))).toEqual({
      iconId: 'cart',
      colorId: 'area-food',
    });
    expect(resolveCategoryIcon(cat({ id: 'mortgage', area: 'essential' }))).toEqual({
      iconId: 'building',
      colorId: 'area-essential',
    });
  });

  it('falls back to the "others" area colour when an expense category has no area', () => {
    expect(resolveCategoryIcon(cat({ id: 'groceries' }))).toEqual({
      iconId: 'cart',
      colorId: 'area-others',
    });
  });

  it('gives savings categories the neutral "saved" colour', () => {
    expect(resolveCategoryIcon(cat({ id: 'investments', group: 'savings' }))).toEqual({
      iconId: 'chart-uptrend',
      colorId: 'area-saved',
    });
  });

  it('keeps the stored/default colour for income categories (no gauge segment)', () => {
    expect(resolveCategoryIcon(cat({ id: 'salary', group: 'income' }))).toEqual({
      iconId: 'briefcase',
      colorId: 'blue',
    });
    expect(resolveCategoryIcon(cat({ id: 'salary', group: 'income', color: 'purple' }))).toEqual({
      iconId: 'briefcase',
      colorId: 'purple',
    });
  });

  it('resolves the glyph independently of the area colour', () => {
    expect(resolveCategoryIcon(cat({ id: 'groceries', icon: 'gift', area: 'food' }))).toEqual({
      iconId: 'gift',
      colorId: 'area-food',
    });
  });

  it('falls back to tag glyph + others-area colour for an unknown expense id', () => {
    expect(resolveCategoryIcon(cat({ id: 'made-up' }))).toEqual({
      iconId: 'tag',
      colorId: 'area-others',
    });
  });
});
