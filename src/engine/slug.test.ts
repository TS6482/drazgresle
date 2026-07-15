import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Eating out')).toBe('eating-out');
  });

  it('folds Czech diacritics to ASCII', () => {
    expect(slugify('Zábava')).toBe('zabava');
    expect(slugify('Dovolená a výlety')).toBe('dovolena-a-vylety');
    expect(slugify('Děti')).toBe('deti');
  });

  it('collapses punctuation runs and trims edge dashes', () => {
    expect(slugify('  Bills & fees!  ')).toBe('bills-fees');
    expect(slugify('---')).toBe('');
  });

  it('keeps digits', () => {
    expect(slugify('Car 2')).toBe('car-2');
  });
});

describe('uniqueSlug', () => {
  it('returns the plain slug when free', () => {
    expect(uniqueSlug('Pets', new Set(['groceries']))).toBe('pets');
  });

  it('appends -2, -3… on collision', () => {
    expect(uniqueSlug('Pets', new Set(['pets']))).toBe('pets-2');
    expect(uniqueSlug('Pets', new Set(['pets', 'pets-2']))).toBe('pets-3');
  });

  it('falls back to "category" for unusable names', () => {
    expect(uniqueSlug('!!!', new Set())).toBe('category');
    expect(uniqueSlug('', new Set(['category']))).toBe('category-2');
  });
});
