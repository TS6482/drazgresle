import { describe, expect, it } from 'vitest';
import { resolveCategoryIcon } from './categoryIcons';
import type { Category } from '../types/data';

function cat(partial: Partial<Category> & { id: string }): Category {
  return { name: partial.id, group: 'expense', ...partial };
}

describe('resolveCategoryIcon', () => {
  it('uses the stored icon/color when set, overriding the id default', () => {
    expect(resolveCategoryIcon(cat({ id: 'groceries', icon: 'star', color: 'pink' }))).toEqual({
      iconId: 'star',
      colorId: 'pink',
    });
  });

  it('falls back to the built-in default for a known seeded id', () => {
    expect(resolveCategoryIcon(cat({ id: 'groceries' }))).toEqual({
      iconId: 'cart',
      colorId: 'green',
    });
    expect(resolveCategoryIcon(cat({ id: 'mortgage' }))).toEqual({
      iconId: 'building',
      colorId: 'indigo',
    });
  });

  it('resolves icon and color independently (stored one, defaulted other)', () => {
    expect(resolveCategoryIcon(cat({ id: 'groceries', icon: 'gift' }))).toEqual({
      iconId: 'gift',
      colorId: 'green',
    });
    expect(resolveCategoryIcon(cat({ id: 'groceries', color: 'red' }))).toEqual({
      iconId: 'cart',
      colorId: 'red',
    });
  });

  it('falls back to tag/gray for an unknown id with nothing stored', () => {
    expect(resolveCategoryIcon(cat({ id: 'made-up' }))).toEqual({
      iconId: 'tag',
      colorId: 'gray',
    });
  });
});
