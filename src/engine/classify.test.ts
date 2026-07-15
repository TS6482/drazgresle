import { describe, expect, it } from 'vitest';
import {
  classify,
  displayVendor,
  extractMerchant,
  matchingRule,
  planRuleUpdate,
  ruleMatchFor,
  suggestRule,
  suggestRuleForStored,
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

describe('displayVendor', () => {
  it('leads with the merchant for card rows (never the cardholder)', () => {
    expect(
      displayVendor({
        counterparty: 'Jan Novák',
        description: 'BURGER PALACE OC PLAZA 12, BRNO, 60200, CZE',
        bankType: 'Platba kartou',
      }),
    ).toBe('BURGER PALACE OC PLAZA 12');
  });

  it('falls back to counterparty, then description, for card rows', () => {
    expect(
      displayVendor({ counterparty: 'Jan Novák', description: '', bankType: 'Platba kartou' }),
    ).toBe('Jan Novák');
    expect(
      displayVendor({ counterparty: '', description: 'PLAIN TEXT', bankType: 'Platba kartou' }),
    ).toBe('PLAIN TEXT');
  });

  it('uses the counterparty name for non-card rows', () => {
    expect(
      displayVendor({
        counterparty: 'ACME CORP',
        description: 'VS9 / KS138',
        bankType: 'Příchozí úhrada',
        counterpartyAccount: '9876543210/0300',
      }),
    ).toBe('ACME CORP');
    expect(displayVendor({ counterparty: 'Eva Malá', description: '' })).toBe('Eva Malá');
  });

  it('uses the merchant segment when there is no counterparty', () => {
    expect(
      displayVendor({ counterparty: '', description: 'Payment for the trip, extra notes' }),
    ).toBe('Payment for the trip');
  });

  it('truncates long text to ~40 chars with an ellipsis', () => {
    const long = 'A'.repeat(60);
    const out = displayVendor({ counterparty: '', description: long });
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
  });

  it('falls back to the counterparty account as a last identifier', () => {
    expect(
      displayVendor({ counterparty: '', description: '', counterpartyAccount: '1029384756/2010' }),
    ).toBe('1029384756/2010');
  });

  it('never returns an empty string', () => {
    expect(displayVendor({ counterparty: '', description: '' })).toBe('—');
    expect(displayVendor({ counterparty: '  ', description: '   ' })).toBe('—');
    expect(
      displayVendor({ counterparty: '', description: '', bankType: 'Platba kartou' }),
    ).toBe('—');
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

describe('suggestRuleForStored', () => {
  it('uses the merchant rule for card rows, like import', () => {
    const r = suggestRuleForStored(
      {
        counterparty: 'Jan Novák',
        description: 'BURGER PALACE OC PLAZA 12, BRNO, 60200',
        bankType: 'Platba kartou',
      },
      'eating-out',
    );
    expect(r).toMatchObject({
      field: 'description',
      match: 'contains',
      pattern: 'BURGER PALACE OC PLAZA 12',
    });
  });

  it('prefers a description merchant over the counterparty for NON-card rows', () => {
    // Stored rows may be old imports without bankType — the counterparty could
    // still be the cardholder, so description patterns are the safer default.
    const r = suggestRuleForStored(
      { counterparty: 'Jan Novák', description: 'CINEMA CITY 04, PRAHA, 15000' },
      'fun',
    );
    expect(r).toMatchObject({
      field: 'description',
      match: 'contains',
      pattern: 'CINEMA CITY 04',
    });
  });

  it('falls back to counterparty-exact when the description is empty', () => {
    const r = suggestRuleForStored(
      { counterparty: 'ACME CORP', description: '', bankType: 'Příchozí úhrada' },
      'salary',
    );
    expect(r).toMatchObject({ field: 'counterparty', match: 'exact', pattern: 'ACME CORP' });
  });

  it('returns null when nothing is usable', () => {
    expect(suggestRuleForStored({ counterparty: '', description: '' }, 'c')).toBeNull();
    expect(
      suggestRuleForStored(
        { counterparty: 'Jan Novák', description: '', bankType: 'Platba kartou' },
        'c',
      ),
    ).toBeNull();
  });
});

describe('ruleMatchFor', () => {
  it('keeps accounts exact, descriptions contains', () => {
    expect(ruleMatchFor('counterpartyAccount', 'anything', 'anything')).toBe('exact');
    expect(ruleMatchFor('description', 'SHOP', 'SHOP CITY 1')).toBe('contains');
  });

  it('counterparty stays exact only while the pattern is untouched', () => {
    expect(ruleMatchFor('counterparty', 'ACME CORP', 'ACME CORP')).toBe('exact');
    expect(ruleMatchFor('counterparty', 'acme corp ', 'ACME CORP')).toBe('exact');
    expect(ruleMatchFor('counterparty', 'ACME', 'ACME CORP')).toBe('contains');
  });
});

describe('matchingRule', () => {
  it('returns the winning rule object (exact pass first)', () => {
    const rules = [
      rule({ id: 'a', field: 'description', match: 'contains', pattern: 'acme', categoryId: 'c1' }),
      rule({ id: 'b', field: 'counterparty', match: 'exact', pattern: 'ACME Corp', categoryId: 'c2' }),
    ];
    expect(matchingRule(tx(), rules)?.id).toBe('b');
    expect(matchingRule(tx({ counterparty: 'other', description: 'other' }), rules)).toBeNull();
  });
});

describe('planRuleUpdate', () => {
  /** Mirror the store merge the planner documents: update known, prepend new. */
  function applyUpserts(rules: Rule[], upserts: Rule[]): Rule[] {
    const byId = new Map(rules.map((r) => [r.id, r]));
    const fresh: Rule[] = [];
    for (const u of upserts) {
      if (byId.has(u.id)) {
        byId.set(u.id, u);
      } else {
        fresh.push(u);
      }
    }
    return [...fresh, ...byId.values()];
  }

  const row: ClassifiableTransaction = {
    counterparty: 'Jan Novák',
    description: 'CINEMA CITY 04, PRAHA, 15000',
    bankType: 'Platba kartou',
  };

  it('retargets an existing same-pattern rule in place (no duplicate)', () => {
    const old = rule({
      id: 'old',
      field: 'description',
      match: 'contains',
      pattern: 'cinema city 04',
      categoryId: 'wrong-cat',
    });
    const target = suggestRuleForStored(row, 'fun') as Rule;
    const upserts = planRuleUpdate([old], row, target);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].id).toBe('old'); // updated, not duplicated
    expect(upserts[0].categoryId).toBe('fun');
    expect(classify(row, applyUpserts([old], upserts))).toBe('fun');
  });

  it('a new rule prepends and beats an older contains rule of the same class', () => {
    const old = rule({
      id: 'old',
      field: 'description',
      match: 'contains',
      pattern: 'cinema',
      categoryId: 'wrong-cat',
    });
    const target: Rule = {
      id: 'new',
      field: 'description',
      match: 'contains',
      pattern: 'CINEMA CITY',
      categoryId: 'fun',
    };
    const upserts = planRuleUpdate([old], row, target);
    expect(upserts).toHaveLength(1);
    const merged = applyUpserts([old], upserts);
    expect(merged[0].id).toBe('new'); // prepended
    expect(classify(row, merged)).toBe('fun'); // old no longer wins
  });

  it('retargets an exact old winner that would still outrank a contains correction', () => {
    // The wrong classification came from a counterparty-exact rule; the
    // correction is a merchant contains rule, which exact would still beat.
    const old = rule({
      id: 'old',
      field: 'counterparty',
      match: 'exact',
      pattern: 'Jan Novák',
      categoryId: 'wrong-cat',
    });
    const target: Rule = {
      id: 'new',
      field: 'description',
      match: 'contains',
      pattern: 'CINEMA CITY',
      categoryId: 'fun',
    };
    const upserts = planRuleUpdate([old], row, target);
    expect(upserts).toHaveLength(2);
    expect(upserts[1]).toMatchObject({ id: 'old', categoryId: 'fun' });
    expect(classify(row, applyUpserts([old], upserts))).toBe('fun');
  });

  it('does not retarget anything when the pattern no longer matches this row', () => {
    // The user broadened/changed the pattern to target future imports only.
    const target: Rule = {
      id: 'new',
      field: 'description',
      match: 'contains',
      pattern: 'SOMETHING ELSE',
      categoryId: 'fun',
    };
    const upserts = planRuleUpdate([], row, target);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].id).toBe('new');
  });
});

describe('stored transactions with a persisted counterpartyAccount', () => {
  // Since Transaction now persists counterpartyAccount (normalized
  // "number/bankCode"), account-exact rules must match stored rows — the
  // retroactive Auto-classify path passes stored Transaction objects straight
  // to classify(). Rows imported before the field existed simply lack it and
  // never match account rules (not backfillable).
  const storedTx = {
    id: 't1',
    date: '2026-07-02',
    amountHalere: 6527200,
    counterparty: 'ACME CORP',
    description: 'VS9 / KS138 SALARY',
    account: 'acc-airbank',
    categoryId: null,
    source: 'airbank' as const,
    importHash: 'abcd1234',
    bankType: 'Příchozí úhrada',
    counterpartyAccount: '9876543210/0300',
  };

  it('an account-exact rule matches a stored transaction carrying the field', () => {
    const rules = [
      rule({ field: 'counterpartyAccount', match: 'exact', pattern: '9876543210/0300', categoryId: 'salary' }),
    ];
    expect(classify(storedTx, rules)).toBe('salary');
    expect(matchingRule(storedTx, rules)?.categoryId).toBe('salary');
  });

  it('an old stored row without the field still works and just never matches', () => {
    const oldRow = { ...storedTx, counterpartyAccount: undefined };
    const rules = [
      rule({ field: 'counterpartyAccount', match: 'exact', pattern: '9876543210/0300', categoryId: 'salary' }),
    ];
    expect(classify(oldRow, rules)).toBeNull();
  });

  it('suggestRuleForStored prefers the persisted account over everything else', () => {
    const r = suggestRuleForStored(storedTx, 'salary');
    expect(r).toMatchObject({
      field: 'counterpartyAccount',
      match: 'exact',
      pattern: '9876543210/0300',
      categoryId: 'salary',
    });
  });
});
