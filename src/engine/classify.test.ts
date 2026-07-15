import { describe, expect, it } from 'vitest';
import {
  classify,
  extractMerchant,
  suggestRule,
  type ClassifiableTransaction,
} from './classify';
import type { Rule } from '../types/data';

function rule(partial: Omit<Rule, 'id'> & { id?: string }): Rule {
  return { id: partial.id ?? `r-${partial.pattern}`, ...partial };
}

const tx = (over: Partial<ClassifiableTransaction> = {}): ClassifiableTransaction => ({
  counterparty: 'ACME Corp',
  description: 'SHOP ACME Praha 1',
  ...over,
});

describe('classify', () => {
  it('returns null when no rule matches', () => {
    expect(classify(tx(), [])).toBeNull();
    expect(
      classify(tx(), [rule({ field: 'counterparty', match: 'exact', pattern: 'OTHER', categoryId: 'c1' })]),
    ).toBeNull();
  });

  it('matches counterparty exactly, case-insensitively', () => {
    const rules = [rule({ field: 'counterparty', match: 'exact', pattern: 'acme corp', categoryId: 'groceries' })];
    expect(classify(tx(), rules)).toBe('groceries');
  });

  it('matches description with contains', () => {
    const rules = [rule({ field: 'description', match: 'contains', pattern: 'praha', categoryId: 'travel' })];
    expect(classify(tx(), rules)).toBe('travel');
  });

  it('exact beats contains regardless of file order', () => {
    const rules = [
      rule({ id: 'a', field: 'description', match: 'contains', pattern: 'acme', categoryId: 'contains-cat' }),
      rule({ id: 'b', field: 'counterparty', match: 'exact', pattern: 'ACME Corp', categoryId: 'exact-cat' }),
    ];
    expect(classify(tx(), rules)).toBe('exact-cat');
  });

  it('first rule wins within the same match type', () => {
    const rules = [
      rule({ id: 'a', field: 'description', match: 'contains', pattern: 'shop', categoryId: 'first' }),
      rule({ id: 'b', field: 'description', match: 'contains', pattern: 'acme', categoryId: 'second' }),
    ];
    expect(classify(tx(), rules)).toBe('first');
  });

  it('matches counterparty account, always exactly', () => {
    const rules = [
      rule({ field: 'counterpartyAccount', match: 'exact', pattern: '9876543210/0300', categoryId: 'salary' }),
    ];
    expect(classify(tx({ counterpartyAccount: '9876543210/0300' }), rules)).toBe('salary');
    // A different account does not match, and a partial does not match.
    expect(classify(tx({ counterpartyAccount: '9876543210/0800' }), rules)).toBeNull();
    expect(classify(tx({ counterpartyAccount: '9876543210' }), rules)).toBeNull();
  });

  it('account rules are treated as high-priority (beat a contains rule)', () => {
    const rules = [
      rule({ id: 'a', field: 'description', match: 'contains', pattern: 'acme', categoryId: 'contains-cat' }),
      rule({ id: 'b', field: 'counterpartyAccount', match: 'contains', pattern: '9876543210/0300', categoryId: 'acct-cat' }),
    ];
    expect(classify(tx({ counterpartyAccount: '9876543210/0300' }), rules)).toBe('acct-cat');
  });

  it('never matches on an empty field or empty pattern', () => {
    expect(
      classify(tx({ counterparty: '' }), [rule({ field: 'counterparty', match: 'contains', pattern: 'x', categoryId: 'c' })]),
    ).toBeNull();
    expect(
      classify(tx(), [rule({ field: 'description', match: 'contains', pattern: '', categoryId: 'c' })]),
    ).toBeNull();
  });
});

describe('extractMerchant', () => {
  it('returns the first comma segment, trimmed', () => {
    expect(extractMerchant('BURGER PALACE OC PLAZA 12, BRNO, 60200')).toBe(
      'BURGER PALACE OC PLAZA 12',
    );
    expect(extractMerchant('  CAFE LUNA 7 , PRAHA')).toBe('CAFE LUNA 7');
  });

  it('returns the whole description when there is no comma', () => {
    expect(extractMerchant('WEBSHOP.EXAMPLE 42')).toBe('WEBSHOP.EXAMPLE 42');
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(extractMerchant('')).toBeNull();
    expect(extractMerchant('   ')).toBeNull();
    expect(extractMerchant(', BRNO')).toBeNull();
  });
});

describe('suggestRule', () => {
  it('prefers an exact counterparty-account rule when present', () => {
    const r = suggestRule(tx({ counterpartyAccount: '9876543210/0300' }), 'salary');
    expect(r).not.toBeNull();
    expect(r).toMatchObject({
      field: 'counterpartyAccount',
      match: 'exact',
      pattern: '9876543210/0300',
      categoryId: 'salary',
    });
    expect(r?.id).toBeTruthy();
  });

  it('falls back to an exact counterparty rule', () => {
    const r = suggestRule(tx({ counterpartyAccount: undefined }), 'groceries');
    expect(r).toMatchObject({
      field: 'counterparty',
      match: 'exact',
      pattern: 'ACME Corp',
      categoryId: 'groceries',
    });
  });

  it('suggests a merchant contains-rule for card payments (counterparty = cardholder)', () => {
    const r = suggestRule(
      {
        counterparty: 'Jan Novák',
        description: 'BURGER PALACE OC PLAZA 12, BRNO, 60200, CZE',
        bankType: 'Platba kartou',
      },
      'eating-out',
    );
    expect(r).toMatchObject({
      field: 'description',
      match: 'contains',
      pattern: 'BURGER PALACE OC PLAZA 12',
      categoryId: 'eating-out',
    });
  });

  it('treats cash withdrawals as card rows too (merchant = ATM string)', () => {
    const r = suggestRule(
      {
        counterparty: 'Jan Novák',
        description: 'Bankomat: FAKE BANK ATM 12, MESTO, 11000',
        bankType: 'Výběr hotovosti',
      },
      'cash',
    );
    expect(r).toMatchObject({
      field: 'description',
      match: 'contains',
      pattern: 'Bankomat: FAKE BANK ATM 12',
    });
  });

  it('account still beats the merchant rule when present', () => {
    const r = suggestRule(
      {
        counterparty: 'Jan Novák',
        description: 'BURGER PALACE, BRNO',
        counterpartyAccount: '9876543210/0300',
        bankType: 'Platba kartou',
      },
      'eating-out',
    );
    expect(r).toMatchObject({ field: 'counterpartyAccount', pattern: '9876543210/0300' });
  });

  it('never suggests a cardholder-name rule for a card row without a description', () => {
    const r = suggestRule(
      { counterparty: 'Jan Novák', description: '', bankType: 'Platba kartou' },
      'misc',
    );
    expect(r).toBeNull();
  });

  it('uses the merchant rule for rows with no counterparty at all', () => {
    const r = suggestRule(
      { counterparty: '', description: 'Payment note text, extra' },
      'misc',
    );
    expect(r).toMatchObject({
      field: 'description',
      match: 'contains',
      pattern: 'Payment note text',
    });
  });

  it('keeps the counterparty-exact rule for non-card rows', () => {
    const r = suggestRule(
      { counterparty: 'ACME CORP', description: 'VS9 / KS138', bankType: 'Příchozí úhrada' },
      'salary',
    );
    expect(r).toMatchObject({ field: 'counterparty', match: 'exact', pattern: 'ACME CORP' });
  });

  it('returns null when there is nothing reliable to key on', () => {
    expect(suggestRule({ counterparty: '', description: '' }, 'c')).toBeNull();
    expect(suggestRule({ counterparty: '', description: '  ,  ' }, 'c')).toBeNull();
  });

  it('a suggested rule then classifies the same transaction', () => {
    const source = tx({ counterpartyAccount: '9876543210/0300' });
    const r = suggestRule(source, 'salary');
    expect(classify(source, [r as Rule])).toBe('salary');
  });
});
